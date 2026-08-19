import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { db } from '@/lib/supabase';
import { readJson, fail, isUuid, text } from '@/lib/http';
import { rateLimit, WRITE } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

//saves title and summary together, from the one editor
export async function POST(request, context) {
    const { id } = await context.params;

    //a malformed id would reach Postgres and come back as a 500; it is the
    //caller's typo, so it is a 400
    if (!isUuid(id)) return fail('Bad meeting id');

    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    //a person clicking quickly is nowhere near this; a loop is
    const tooMany = rateLimit(request, { bucket: 'edit', identity: user.email, ...WRITE });
    if (tooMany) return tooMany;

    const body = await readJson(request);
    if (body instanceof Response) return body;
    const title = text(body.title, { max: 120 });
    const summary = text(body.summary, { max: 5000 });

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
