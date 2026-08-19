import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { addColumn } from '@/lib/columns';
import { readJson } from '@/lib/http';
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

//adding a custom column
export async function POST(request) {
    const email = await currentEmail();
    if (!email) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const tooMany = rateLimit(request, { bucket: 'columns', identity: email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;

    try {
        //addColumn does the checking: the name is trimmed to 40, the type must
        //be a known one, the option list is capped at 20
        const column = await addColumn(email, {
            name: body.name,
            type: body.type,
            options: body.options,
        });
        return NextResponse.json({ ok: true, column });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
