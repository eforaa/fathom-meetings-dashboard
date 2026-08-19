import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { setColumnValue } from '@/lib/columns';
import { readJson, fail, isUuid } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';

//always run, never cache
export const dynamic = 'force-dynamic';

//setting one custom-column value on one meeting
export async function POST(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;

    //a malformed id would reach Postgres and come back as a 500; it is the
    //caller's typo, so it is a 400
    if (!isUuid(id)) return fail('Bad meeting id');

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    //a person clicking quickly is nowhere near this; a loop is
    const tooMany = rateLimit(request, { bucket: 'fields', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;
    //the column id is a uuid too, and setColumnValue puts it in a query
    if (!isUuid(body.columnId)) {
        return NextResponse.json({ error: 'columnId is required' }, { status: 400 });
    }

    try {
        const result = await setColumnValue(user.email, id, body.columnId, body.value);
        return NextResponse.json({ ok: true, ...result });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
