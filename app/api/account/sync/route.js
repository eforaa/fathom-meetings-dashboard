import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { runIngest } from '@/lib/ingest';

//always executing the route
export const dynamic = 'force-dynamic';
//maximum execution time
export const maxDuration = 60;

//the "sync now" button on the settings page
export async function POST() {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    try {
        //only this person, so one manual sync does not pull everyone else
         const result = await runIngest({ onlyEmail: user.email, maxPages: 3 });
        //success response
        return NextResponse.json({ ok: true, ...result });
    } catch (caught) {
        //error handling converting error to text
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error('manual sync failed:', message);

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}