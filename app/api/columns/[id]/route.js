import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { removeColumn } from '@/lib/columns';

//always run, never cache
export const dynamic = 'force-dynamic';

//removing a custom column
export async function DELETE(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    try {
        await removeColumn(user.email, id);
        return NextResponse.json({ ok: true });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
