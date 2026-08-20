import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { readJson, fail, oneOf } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';
import { idsOf } from '@/lib/bulk';
import { toCsv, toMarkdown, fileName, MIME, MAX_EXPORT } from '@/lib/export';
import { dayOf } from '@/lib/date-range';
import {
    meetingTitle, meetingSummary, meetingTypes, typeLabel, formatDuration,
} from '@/lib/format';
import { peopleByMeeting } from '@/lib/people';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

//Выгрузка того, что человек видит на экране.
//
//Список приходит с браузера готовым — теми же id и в том же порядке, что в
//таблице. Так выгрузка совпадает с экраном ровно: тот же отбор, та же
//сортировка, та же группировка. Повторять весь путь отбора на сервере значило
//бы держать две копии одних правил и однажды получить файл, не похожий на то,
//что человек только что рассматривал.
//
//Владелец всё равно проверяется здесь: список id приходит от браузера, а
//браузеру верить нельзя.
export async function POST(request) {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const tooMany = rateLimit(request, { bucket: 'export', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request, { maxBytes: 512 * 1024 });
    if (body instanceof Response) return body;

    const format = oneOf(body.format, ['csv', 'md'], 'csv');
    const lang = oneOf(body.lang, ['uk', 'ru', 'en'], 'uk');
    //предел здесь свой: выгрузить весь список — обычное дело, а изменить
    //двести встреч одним нажатием — нет
    const ids = idsOf(body.ids, MAX_EXPORT);
    if (!ids.length) return fail('Nothing to export');

    const { data: rows, error } = await db
        .from('meetings')
        //ровно те поля, из которых складываются показанные значения. Список
        //сверен с базой: title_pin здесь когда-то стоял по ошибке — такой
        //колонки нет, выбор названия хранится внутри custom_fields
        .select('id, title, ai_title, custom_title, fathom_title, custom_fields, summary, custom_summary, types, meeting_type, importance, duration_minutes, date')
        .in('id', ids)
        .eq('owner_email', user.email);

    if (error) {
        console.error('export failed:', error.message);
        return NextResponse.json({ error: 'Could not read' }, { status: 500 });
    }

    //порядок с экрана: база отдаёт строки в своём порядке, а человек ждёт
    //ровно тот список, который видел
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    //участники — вторым запросом, уже по своим встречам
    const { data: people } = await db
        .from('participants')
        .select('id, meeting_id, name, email, identity')
        .in('meeting_id', ordered.map((row) => row.id));

    const grouped = new Map();
    for (const person of people ?? []) {
        const list = grouped.get(person.meeting_id) ?? [];
        list.push(person);
        grouped.set(person.meeting_id, list);
    }

    //те же правила склейки людей, что в списке: один человек под тремя никами
    //не должен превратиться в трёх участников файла
    const resolved = peopleByMeeting(ordered, grouped);

    const columns = [
        { title: t(lang, 'export.date'), value: (row) => dayOf(row.date) ?? '' },
        { title: t(lang, 'export.time'), value: (row) => timeOf(row.date) },
        { title: t(lang, 'export.title'), value: (row) => meetingTitle(row, lang) },
        {
            title: t(lang, 'export.types'),
            value: (row) => meetingTypes(row).map((type) => typeLabel(type, lang)).join(', '),
        },
        { title: t(lang, 'export.importance'), value: (row) => row.importance ?? '', numeric: true },
        {
            title: t(lang, 'export.duration'),
            value: (row) => (row.duration_minutes == null ? '' : formatDuration(row.duration_minutes, lang)),
            numeric: true,
        },
        {
            title: t(lang, 'export.people'),
            //уже склеенные люди: имя выбрано по всем их встречам сразу
            value: (row) => (resolved.get(row.id) ?? []).map((person) => person.name).join(', '),
        },
        { title: t(lang, 'export.summary'), value: (row) => meetingSummary(row) },
    ];

    const range = { from: body.from ?? null, to: body.to ?? null };
    const name = fileName({ ...range, format, stamp: dayOf(new Date().toISOString()) });

    const text = format === 'md'
        ? toMarkdown(ordered, columns, { title: t(lang, 'export.heading', { n: ordered.length }) })
        : toCsv(ordered, columns);

    return new NextResponse(text, {
        headers: {
            'Content-Type': MIME[format],
            //filename* — та же строка в кодировке, понятной браузеру: без неё
            //кириллица в имени файла превращается в вопросительные знаки
            'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            'Cache-Control': 'no-store',
        },
    });
}

//время встречи по Киеву — как везде в приложении
function timeOf(iso) {
    if (!iso) return '';

    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';

    return new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
    }).format(at);
}
