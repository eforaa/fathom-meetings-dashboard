import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { addColumn } from '@/lib/columns';

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

    const body = await request.json().catch(() => ({}));

    try {
        const column = await addColumn(email, {
            name: body?.name,
            type: body?.type,
            options: body?.options,
        });
        return NextResponse.json({ ok: true, column });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
