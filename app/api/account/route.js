import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { verifyApiKey, saveApiKey, removeApiKey } from '@/lib/accounts';
import { readJson, text } from '@/lib/http';
import { rateLimit, SENSITIVE } from '@/lib/rate-limit';

//always executing the route
export const dynamic = 'force-dynamic';

//getting the person who is signed in
async function currentUser() {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return user ?? null;
}

//saving a new Fathom key
export async function POST(request) {
    const user = await currentUser();
    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    //saving a key calls Fathom to verify it, so this one is held tighter
    const tooMany = rateLimit(request, { bucket: 'account-key', identity: user.email, ...SENSITIVE });
    if (tooMany) return tooMany;

    //this used to be a bare request.json(): a malformed body threw, and the
    //route answered 500 for what is plainly a bad request
    const body = await readJson(request);
    if (body instanceof Response) return body;

    //Fathom's keys are far shorter than this; the cap is only here so an
    //enormous string never reaches their API on our account
    const trimmed = text(body.apiKey, { max: 500 });

    //empty field
    if (!trimmed) {
        return NextResponse.json({ error: 'The key is empty' }, { status: 400 });
    }

    //checking the key with Fathom before saving it
    const check = await verifyApiKey(trimmed);
    if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
    }

    try {
        await saveApiKey(user.email, trimmed);
        return NextResponse.json({ ok: true });
    } catch (caught) {
        //error handling converting error to text
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error('account save failed:', message);

        return NextResponse.json({ error: 'Could not save the key' }, { status: 500 });
    }
}

//disconnecting the account
export async function DELETE(request) {
    const user = await currentUser();
    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const tooMany = rateLimit(request, { bucket: 'account-key', identity: user.email, ...SENSITIVE });
    if (tooMany) return tooMany;

    try {
        await removeApiKey(user.email);
        return NextResponse.json({ ok: true });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error('account removal failed:', message);

        return NextResponse.json({ error: 'Could not remove the key' }, { status: 500 });
    }
}