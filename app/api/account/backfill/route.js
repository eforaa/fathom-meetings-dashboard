import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { runBackfill } from '@/lib/ingest';
import { rateLimit, EXPENSIVE } from '@/lib/rate-limit';

//always executing the route
export const dynamic = 'force-dynamic';
//maximum execution time
export const maxDuration = 60;

//one call does one time slice of the archive download
//the settings page keeps calling until done comes back true
export async function POST(request) {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    //security check
    if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    //this pulls pages from Fathom on our key; a person needs it once in a while
    const tooMany = rateLimit(request, { bucket: 'backfill', identity: user.email, ...EXPENSIVE });
    if (tooMany) return tooMany;

    try {
        const result = await runBackfill({ email: user.email });
        return NextResponse.json({ ok: true, ...result });
    } catch (caught) {
        //error handling converting error to text
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error('backfill failed:', message);

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
