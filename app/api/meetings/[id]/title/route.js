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

    //three actions the title picker can ask for:
    //- revert: drop both the hand name and the ai name, show the original
    //- useAi: drop only the hand name, so the ai suggestion shows again
    //- otherwise: set the hand name (empty string also just clears it)
    let patch;
    if (body?.revert) {
        patch = { custom_title: null, ai_title: null };
    } else if (body?.useAi) {
        patch = { custom_title: null };
    } else {
        patch = { custom_title: String(body?.title ?? '').trim().slice(0, MAX_LENGTH) || null };
    }

    const { error } = await db
        .from('meetings')
        .update(patch)
        .eq('id', id)
        .eq('owner_email', user.email);

    if (error) {
        console.error('title update failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
