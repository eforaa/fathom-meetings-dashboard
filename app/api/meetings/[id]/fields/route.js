import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { setColumnValue } from '@/lib/columns';

//always run, never cache
export const dynamic = 'force-dynamic';

//setting one custom-column value on one meeting
export async function POST(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!body?.columnId) {
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
