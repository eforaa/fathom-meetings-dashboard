import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';

//always run, never cache
export const dynamic = 'force-dynamic';

//longest title we keep, same cap as the analysis title
const MAX_LENGTH = 120;

//renaming one meeting by hand
export async function POST(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim().slice(0, MAX_LENGTH);

    //an empty title clears the custom name and falls back to the others
    const { error } = await db
        .from('meetings')
        .update({ custom_title: title || null })
        .eq('id', id)
        .eq('owner_email', user.email);

    if (error) {
        console.error('title update failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, title: title || null });
}
