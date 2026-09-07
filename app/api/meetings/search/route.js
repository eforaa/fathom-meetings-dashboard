import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { searchMeetingIds } from '@/lib/queries';
import { meetingTitle, formatDate } from '@/lib/format';
import { getLang } from '@/lib/i18n/server';

//Живой поиск встреч для командной палитры (⌘K). Отдаёт немного готовых
//хитов — id, отображаемое имя и дату — чтобы палитра показывала список и
//вела прямо на страницу встречи. Тяжёлый разбор запроса переиспользуется
//из searchMeetingIds, который уже ищет по названиям, саммари, транскриптам
//и участникам и делает это в одном месте на весь проект.
export const dynamic = 'force-dynamic';

//палитра — не таблица: двадцати совпадений хватает, чтобы выбрать нужное,
//а не листать
const MAX_HITS = 20;
//сколько id максимум отдаём в фильтр по датам — верхняя граница, чтобы
//очень широкий запрос не тянул тысячу строк ради двадцати показанных
const ID_CAP = 300;

export async function GET(request) {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();
    //не вошёл — пустой ответ, а не 401: палитра просто ничего не покажет
    if (!user?.email) return NextResponse.json({ results: [] });

    const q = new URL(request.url).searchParams.get('q') ?? '';
    //searchMeetingIds сам отсекает слишком короткое (меньше двух знаков) —
    //возвращает null, и мы отвечаем пустым списком
    const ids = await searchMeetingIds(user.email, q);
    if (!ids || ids.size === 0) return NextResponse.json({ results: [] });

    const lang = await getLang();
    //владелец проверяется ещё раз здесь: id пришли из поиска этого же
    //владельца, но owner_email в запросе — это гарантия, а не украшение
    const { data, error } = await db
        .from('meetings')
        .select('id, title, ai_title, fathom_title, custom_title, custom_fields, date')
        .eq('owner_email', user.email)
        .in('id', [...ids].slice(0, ID_CAP))
        .order('date', { ascending: false })
        .limit(MAX_HITS);

    if (error) {
        console.error('command-palette search failed:', error.message);
        return NextResponse.json({ results: [] });
    }

    const results = (data ?? []).map((m) => ({
        id: m.id,
        title: meetingTitle(m, lang),
        date: formatDate(m.date, lang),
    }));

    return NextResponse.json({ results });
}
