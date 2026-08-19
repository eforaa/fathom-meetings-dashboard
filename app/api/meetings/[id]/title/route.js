import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { readJson, fail, isUuid, text, oneOf } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';

//always run, never cache
export const dynamic = 'force-dynamic';

//longest title we keep, same cap as the analysis title
const MAX_LENGTH = 120;

//renaming one meeting by hand
export async function POST(request, context) {
    //next 16: params is a promise
    const { id } = await context.params;

    //a malformed id would reach Postgres and come back as a 500; it is the
    //caller's typo, so it is a 400
    if (!isUuid(id)) return fail('Bad meeting id');

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    //a person clicking quickly is nowhere near this; a loop is
    const tooMany = rateLimit(request, { bucket: 'title', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;

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

    const choice = oneOf(body.choice, ['original', 'ai', 'custom']);

    if (choice) {
        fields[CHOICE_KEY] = choice;
        patch.custom_fields = fields;
    } else {
        //setting (or clearing) a manual name; pin to it so it shows over the rest
        const title = text(body.title, { max: MAX_LENGTH });
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
