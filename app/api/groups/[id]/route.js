import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { renameGroup, moveGroup, deleteGroup } from '@/lib/groups';
import { readJson, fail, isUuid } from '@/lib/http';
import { rateLimit, WRITE, SENSITIVE } from '@/lib/rate-limit';

//always run, never cache
export const dynamic = 'force-dynamic';

async function currentEmail() {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return user?.email ?? null;
}

//Переименовать или перенести.
//
//Два действия в одном маршруте, потому что оба — это правка одной строки, и
//боковая панель шлёт их одинаково. Что именно делать, решает наличие ключа:
//`name` переименовывает, `parentId` переносит. Переноса в корень иначе не
//выразить — null как значение и отсутствие ключа обязаны различаться.
export async function PATCH(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;
    if (!isUuid(id)) return fail('Bad group id');

    const email = await currentEmail();
    if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const tooMany = rateLimit(request, { bucket: 'group-edit', identity: email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const renaming = typeof body.name === 'string';
    const moving = Object.hasOwn(body, 'parentId');

    if (!renaming && !moving) return fail('Nothing to change');
    if (moving && body.parentId != null && !isUuid(body.parentId)) return fail('Bad parent id');

    try {
        //перенос идёт вторым: если человек прислал и то, и другое, имя уже
        //записано, и отказ по циклу не отменит переименование
        const group = renaming ? await renameGroup(email, id, body.name) : null;
        const moved = moving ? await moveGroup(email, id, body.parentId ?? null) : null;

        return NextResponse.json({ ok: true, group: moved ?? group });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

//Удалить папку. Встречи остаются — исчезает только раскладка.
//
//?cascade=1 уносит и подпапки; без него они поднимаются на место удалённой.
//Лимит тот же, что у удаления колонки: действие разрушительное, и цикл,
//дорвавшийся до маршрута, не должен снести дерево целиком.
export async function DELETE(request, context) {
    const { id } = await context.params;
    if (!isUuid(id)) return fail('Bad group id');

    const email = await currentEmail();
    if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const tooMany = rateLimit(request, { bucket: 'group-delete', identity: email, ...SENSITIVE });
    if (tooMany) return tooMany;

    const cascade = new URL(request.url).searchParams.get('cascade') === '1';

    try {
        const result = await deleteGroup(email, id, { cascade });
        return NextResponse.json({ ok: true, ...result });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
