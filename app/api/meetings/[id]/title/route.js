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

    //the picker pins WHICH of the three names to show, without deleting any:
    //   choice: 'original' | 'ai' | 'custom'
    //setting your own name writes custom_title and pins 'custom'.
    //the pin lives in custom_fields[__title_choice] (no schema change).
    const CHOICE_KEY = '__title_choice';

    //read the current custom_fields so the pin merges instead of replacing
    const { data: current } = await db
        .from('meetings')
        .select('custom_fields')
        .eq('id', id)
        .eq('owner_email', user.email)
        .single();

    const fields = { ...(current?.custom_fields ?? {}) };
    const patch = {};

    if (body?.choice === 'original' || body?.choice === 'ai' || body?.choice === 'custom') {
        fields[CHOICE_KEY] = body.choice;
        patch.custom_fields = fields;
    } else {
        //setting (or clearing) a manual name; pin to it so it shows over the rest
        const title = String(body?.title ?? '').trim().slice(0, MAX_LENGTH);
        patch.custom_title = title || null;
        if (title) fields[CHOICE_KEY] = 'custom';
        else delete fields[CHOICE_KEY];
        patch.custom_fields = fields;
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
