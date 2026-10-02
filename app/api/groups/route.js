import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { createGroup, listGroups, listMemberships } from '@/lib/groups';
import { readJson, fail, isUuid } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';

//always run, never cache
export const dynamic = 'force-dynamic';

async function currentEmail() {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return user?.email ?? null;
}

//дерево папок владельца вместе с членством. Страница читает их напрямую через
//lib/groups, а маршрут нужен браузеру: боковая панель обновляет список после
//правки, не перезагружая всю страницу целиком
export async function GET() {
    const email = await currentEmail();
    if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const groups = await listGroups(email);
    const members = await listMemberships(email);

    return NextResponse.json({ groups, members });
}

//новая папка, при желании — внутри уже существующей
export async function POST(request) {
    const email = await currentEmail();
    if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const tooMany = rateLimit(request, { bucket: 'groups', identity: email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;

    //битый id родителя не должен доезжать до Postgres: там это ошибка типа,
    //то есть 500 вместо внятного «такой папки нет»
    if (body.parentId != null && !isUuid(body.parentId)) return fail('Bad parent id');

    try {
        //имя, глубина, владение родителем и предел на число папок —
        //всё проверяет createGroup, чтобы коннектор жил по тем же правилам
        const group = await createGroup(email, { name: body.name, parentId: body.parentId ?? null });
        return NextResponse.json({ ok: true, group });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
