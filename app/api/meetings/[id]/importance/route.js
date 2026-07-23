import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';

//always run, never cache
export const dynamic = 'force-dynamic';

//setting the importance of one meeting
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
    //clamp to 0..5, anything else becomes 0
    const importance = Math.min(Math.max(Math.round(Number(body?.importance) || 0), 0), 5);

    //owner is checked in the query, so nobody rates someone else's meeting
    const { error } = await db
        .from('meetings')
        .update({ importance })
        .eq('id', id)
        .eq('owner_email', user.email);

    if (error) {
        console.error('importance update failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, importance });
}
