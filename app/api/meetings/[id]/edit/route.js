import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

//saves title and summary together, from the one editor
export async function POST(request, context) {
    const { id } = await context.params;

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim().slice(0, 120);
    const summary = String(body?.summary ?? '').trim().slice(0, 5000);

    const { error } = await db
        .from('meetings')
        .update({
            //empty value clears the field back to the automatic one
            custom_title: title || null,
            custom_summary: summary || null,
        })
        .eq('id', id)
        .eq('owner_email', user.email);

    if (error) {
        console.error('edit failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
