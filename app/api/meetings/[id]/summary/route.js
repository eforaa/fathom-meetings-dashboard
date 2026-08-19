import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { readJson, fail, isUuid, text } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';

//always run, never cache
export const dynamic = 'force-dynamic';

//a long-form summary, capped so one field stays sane
const MAX_LENGTH = 5000;

//editing the summary of one meeting by hand
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
    const tooMany = rateLimit(request, { bucket: 'summary', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;
    const summary = text(body.summary, { max: MAX_LENGTH });

    //an empty value clears the custom summary and falls back to the machine one
    const { error } = await db
        .from('meetings')
        .update({ custom_summary: summary || null })
        .eq('id', id)
        .eq('owner_email', user.email);

    if (error) {
        console.error('summary update failed:', error.message);
        return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, summary: summary || null });
}
