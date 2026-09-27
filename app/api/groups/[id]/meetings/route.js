import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { assignMeetings, removeMeetings, MAX_ASSIGN, validateMeetingIds } from '@/lib/groups';
import { readJson, fail, isUuid } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';

//always run, never cache
export const dynamic = 'force-dynamic';

//Положить пачку встреч в папку или вынуть её оттуда.
//
//Один маршрут на оба направления — как у панели действий над пачкой: то же
//выделение, та же кнопка, только «в папку» и «из папки». Направление приходит
//в `action`, а не в методе запроса: DELETE с телом поддерживают не все
//посредники, а список из двухсот id в адресную строку не помещается.
export async function POST(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;
    if (!isUuid(id)) return fail('Bad group id');

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const tooMany = rateLimit(request, { bucket: 'group-members', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;

    //те же правила, что у пакетной правки: только настоящие id, без повторов,
    //не больше предела — иначе битая строка доедет до Postgres как ошибка типа
    if (!['add', 'remove'].includes(body.action)) return fail('Action must be add or remove');
    const action = body.action;

    try {
        const ids = validateMeetingIds(body.ids);
        //владение папкой и владение встречами проверяет lib/groups — там же,
        //где их проверяет коннектор, чтобы правило было одно на оба входа
        const result = action === 'remove'
            ? await removeMeetings(user.email, id, ids)
            : await assignMeetings(user.email, id, ids);

        return NextResponse.json({ ok: true, action, limit: MAX_ASSIGN, ...result });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
