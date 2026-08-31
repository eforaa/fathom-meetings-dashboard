import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { readJson, fail } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';
import { idsOf, patchOf, splitByNeed, groupRestore, MAX_BULK } from '@/lib/bulk';

export const dynamic = 'force-dynamic';

//Одна правка на всю пачку.
//
//Могло быть проще: браузер шлёт двенадцать обычных запросов, по одному на
//встречу. Но тогда двенадцать раз проверяется вход, двенадцать раз считается
//лимит, а главное — половина запросов может пройти, половина упасть, и
//собрать из этого внятный ответ человеку уже нельзя. Здесь один запрос, один
//ответ и три списка в нём.
export async function POST(request) {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    //пачка меняет до двухсот строк за раз, поэтому лимит тот же, что у
    //одиночных правок: человек столько не нажмёт, цикл нажмёт
    const tooMany = rateLimit(request, { bucket: 'bulk', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;

    //--- отмена: каждой встрече возвращается её прежнее значение -------------
    if (Array.isArray(body.restore)) {
        const groups = groupRestore(body.restore);
        if (!groups.length) return fail('Nothing to restore');

        const restored = [];

        for (const group of groups) {
            //владелец проверяется в самом запросе, поэтому чужая строка просто
            //не найдётся — не «нельзя», а «нечего менять»
            const { data, error } = await db
                .from('meetings')
                .update(group.patch)
                .in('id', group.ids)
                .eq('owner_email', user.email)
                .select('id');

            if (error) {
                console.error('bulk restore failed:', error.message);
                return NextResponse.json({ error: 'Could not save' }, { status: 500 });
            }

            restored.push(...data.map((row) => row.id));
        }

        return NextResponse.json({ changed: restored, unchanged: [], failed: [] });
    }

    //--- обычная правка -----------------------------------------------------
    const ids = idsOf(body.ids);
    if (!ids.length) return fail('No meetings chosen');

    const patch = patchOf(body.set);
    if (!Object.keys(patch).length) return fail('Nothing to set');

    //нынешние значения — и заодно проверка владельца: чужие и несуществующие
    //id сюда просто не приедут
    const { data: rows, error: readFailed } = await db
        .from('meetings')
        .select('id, types, importance, archived')
        .in('id', ids)
        .eq('owner_email', user.email);

    if (readFailed) {
        console.error('bulk read failed:', readFailed.message);
        return NextResponse.json({ error: 'Could not read' }, { status: 500 });
    }

    const mine = new Set(rows.map((row) => row.id));
    //id, которых нет среди своих: чужая встреча, удалённая встреча, опечатка.
    //Ответ называет их отдельно, а не молчит о них
    const failed = ids.filter((id) => !mine.has(id));

    const { changed, unchanged } = splitByNeed(rows, patch);

    //прежние значения возвращаются вместе с ответом: из них страница соберёт
    //отмену, не спрашивая сервер второй раз
    const previous = rows
        .filter((row) => changed.includes(row.id))
        .map((row) => ({ id: row.id, types: row.types ?? [], importance: row.importance ?? 0 }));

    if (!changed.length) {
        return NextResponse.json({ changed: [], unchanged, failed, previous: [] });
    }

    const { data: written, error } = await db
        .from('meetings')
        .update(patch)
        .in('id', changed)
        .eq('owner_email', user.email)
        .select('id');

    if (error) {
        console.error('bulk update failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    const done = new Set(written.map((row) => row.id));

    return NextResponse.json({
        changed: [...done],
        unchanged,
        //строка, которая прошла проверку владельца, но не записалась —
        //отдельный случай, и он тоже не должен теряться
        failed: [...failed, ...changed.filter((id) => !done.has(id))],
        previous: previous.filter((row) => done.has(row.id)),
        limit: MAX_BULK,
    });
}
