import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { MEETING_TYPES } from '@/lib/ai';
import { MAX_TYPES } from '@/lib/format';

//always run, never cache
export const dynamic = 'force-dynamic';

//setting the types of one meeting
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

    //keep known values only, drop duplicates, cap the count
    const types = Array.isArray(body?.types)
        ? [...new Set(body.types.filter((type) => MEETING_TYPES.includes(type)))].slice(0, MAX_TYPES)
        : [];

    //owner is checked in the query, so nobody edits someone else's meeting
    const { error } = await db
        .from('meetings')
        .update({ types: types.length ? types : null })
        .eq('id', id)
        .eq('owner_email', user.email);

    if (error) {
        console.error('types update failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, types });
}
