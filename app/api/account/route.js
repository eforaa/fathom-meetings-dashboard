import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { verifyApiKey, saveApiKey, removeApiKey } from '@/lib/accounts';

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

    const { apiKey } = await request.json();
    const trimmed = String(apiKey ?? '').trim();

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
export async function DELETE() {
    const user = await currentUser();
    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    try {
        await removeApiKey(user.email);
        return NextResponse.json({ ok: true });
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error('account removal failed:', message);

        return NextResponse.json({ error: 'Could not remove the key' }, { status: 500 });
    }
}