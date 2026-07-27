import { db } from './supabase.js';
import {
    fetchMeetings,
    fetchMeetingsPage,
    transcriptToText,
    meetingSpan,
    extractParticipants,
    fathomTitle,
} from './fathom.js';
import {
    listAccountsWithKeys,
    getAccountWithKey,
    recordSync,
    saveBackfillProgress,
    markBackfillStart,
} from './accounts.js';
import { autoNameImpromptu } from './series.js';

//to prevent system to load only one meetings created at the same time
//overlap is going back for 10 minutes
const OVERLAP_MINUTES = 10;

//pause between fathom pages during backfill
const PAUSE_BETWEEN_PAGES_MS = 1100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//finding the last synced date for one account
//every person has own key and own cursor, so it can not be taken
//from the meetings table any more
function lastSyncPoint(account) {
    //if no previous sync using default date
    if (!account.lastSyncedAt) {
        return process.env.INITIAL_SINCE ?? '2025-01-01T00:00:00Z';
    }

    //going back 10 minutes to avoid missing meetings
    return new Date(
        new Date(account.lastSyncedAt).getTime() - OVERLAP_MINUTES * 60_000
    ).toISOString();
}

//saving a batch of fathom meetings for one owner
//used by the incremental sync and by the archive backfill
async function saveMeetings(ownerEmail, meetings) {
    //count
    let inserted = 0;
    let skipped = 0;
    //the rows we actually created this run, so series-matching can look only
    //at the new meetings instead of re-scanning the whole account
    const fresh = [];

    for (const m of meetings) {
        // recording_id coming in integer format
        const recordingId = m.recording_id == null
            ? null : String(m.recording_id);
        //if no recording id
        if (!recordingId) {
            skipped++;
            continue;
        }

        //one consistent pair: start, end and duration never cross sources
        const { start: startTime, end: endTime, seconds } = meetingSpan(m);

        //fathom's own summary and action items, ready to use
        const fathomSummary = m.default_summary?.markdown_formatted ?? null;
        const fathomActions = Array.isArray(m.action_items) && m.action_items.length
            ? m.action_items
            : null;
        //short title pulled from the summary's purpose line
        const fathomTitleText = fathomTitle(fathomSummary);

        //database row is built
        const row = {
            //who this meeting belongs to
            //the same call can come from two keys and becomes two rows
            owner_email: ownerEmail,
            recording_id: recordingId,
            title: m.title ?? 'Without name',
            date: startTime,
            start_time: startTime,
            end_time: endTime,
            duration_seconds: seconds,
            duration_minutes: seconds === null ? null : Math.round(seconds / 60),
            recording_url: m.url ?? null,
            raw_transcript: transcriptToText(m),
            fathom_created_at: m.created_at ?? startTime,
            analysis_status: 'pending',
            //fathom-made fields, stored apart from our ai analysis
            fathom_summary: fathomSummary,
            fathom_action_items: fathomActions,
            fathom_title: fathomTitleText,
            transcript_language: m.transcript_language ?? null,
        };

        // if meeting already exists, database will return it with null value
        // conflict is on the pair now, not on recording_id alone
        const { data, error } = await db
            .from('meetings')
            .upsert(row, {
                onConflict: 'owner_email,recording_id',
                ignoreDuplicates: true
            })
            .select('id')
            .maybeSingle();

        //error handling
        if (error) {
            console.error(`ingest: ${recordingId} — ${error.message}`);
            skipped++;
            continue;
        }
        //meeting already exists in database
        if (!data) {
            //old rows were loaded before fathom summary was stored
            //refresh only the fathom-made fields, our analysis is not touched
            if (fathomSummary || fathomActions) {
                const { error: uErr } = await db
                    .from('meetings')
                    .update({
                        fathom_summary: fathomSummary,
                        fathom_action_items: fathomActions,
                        fathom_title: fathomTitleText,
                        transcript_language: m.transcript_language ?? null,
                    })
                    .eq('owner_email', ownerEmail)
                    .eq('recording_id', recordingId);

                if (uErr) console.error(`ingest: enrich ${recordingId} — ${uErr.message}`);
            }

            skipped++;
            continue;
        }

        inserted++;
        //remember the new row for the series matcher below
        fresh.push({
            id: data.id,
            title: row.title,
            date: row.date,
            start_time: row.start_time,
            duration_minutes: row.duration_minutes,
        });

        // new meetings are inserted as usual
        const people = extractParticipants(m);
        //saving participants who were in this meeting
        if (people.length) {
            const { error: pErr } = await db
                .from('participants')
                .insert(
                    people.map((p) => ({
                        ...p, meeting_id: data.id
                    }))
                );
            // log participant insert errors
            if (pErr) console.error(`ingest: participants ${recordingId} — ${pErr.message}`);
        }
    }

    return { inserted, skipped, fresh };
}

//how many meetings this person has in total, shown in settings
async function countMeetings(ownerEmail) {
    const { count } = await db
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('owner_email', ownerEmail);

    return count ?? 0;
}

//getting meetings from Fathom for one account and saving them to database
async function ingestAccount(account, { since: forcedSince, maxPages } = {}) {
    //using provided date or find the last synchronization point
    const since = forcedSince ?? lastSyncPoint(account);
    //getting meeting that are made after this date
    const meetings = await fetchMeetings({
        apiKey: account.apiKey,
        createdAfter: since,
        maxPages
    });

    const { inserted, skipped, fresh } = await saveMeetings(account.userEmail, meetings);

    //new nameless calls: try to recognise a regular series and name it (🤖).
    //participants are already saved above, so the matcher can read them.
    let seriesNamed = 0;
    let namelessNew = 0;
    try {
        const result = await autoNameImpromptu(account.userEmail, fresh);
        seriesNamed = result.named;
        //nameless calls the matcher could not resolve — these surface in the
        //dashboard's "Без названия" banner for a human to name
        namelessNew = Math.max(0, (result.checked ?? 0) - result.named);
        if (namelessNew > 0) {
            console.log(`ingest: ${account.userEmail} — ${namelessNew} new nameless meeting(s) need attention`);
        }
    } catch (caught) {
        //naming is a best-effort enrichment; never fail the whole sync over it
        console.error(`ingest: series match ${account.userEmail} — ${caught instanceof Error ? caught.message : caught}`);
    }

    //returning data about the sync process
    return {
        fetched: meetings.length,
        inserted,
        skipped,
        seriesNamed,
        namelessNew,
        since
    };
}

//running ingest for every connected account
//onlyEmail is used by the "sync now" button on the settings page
export async function runIngest({ onlyEmail, since, maxPages } = {}) {
    const all = await listAccountsWithKeys();

    const accounts = onlyEmail
        ? all.filter((account) => account.userEmail === onlyEmail)
        : all;

    //count for all accounts together
    const perAccount = [];
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;

    for (const account of accounts) {
        //time is taken before the download
        //a meeting that becomes ready during the run would fall into the gap
        const startedAt = new Date().toISOString();

        try {
            const result = await ingestAccount(account, { since, maxPages });

            fetched += result.fetched;
            inserted += result.inserted;
            skipped += result.skipped;

            await recordSync(account.userEmail, {
                ok: true,
                meetingsCount: await countMeetings(account.userEmail),
                syncedAt: startedAt
            });

            perAccount.push({ email: account.userEmail, ...result });
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : String(caught);
            console.error(`ingest: account ${account.userEmail} — ${message}`);

            //one broken key should not stop the other accounts
            await recordSync(account.userEmail, { ok: false, error: message });

            perAccount.push({ email: account.userEmail, error: message });
        }
    }

    //returning data about the whole run
    return {
        accounts: accounts.length,
        fetched,
        inserted,
        skipped,
        perAccount
    };
}

//full archive download for one account, one time slice per call
//no created_after: the whole history is walked page by page
//the cursor is saved after every page, so the next call continues
//exactly where this one stopped, even after a vercel timeout
export async function runBackfill({ email, timeBudgetMs = 40_000 } = {}) {
    const account = await getAccountWithKey(email);
    if (!account) throw new Error('No Fathom key connected');

    //nothing left to do
    if (account.backfillDone) {
        return { done: true, pages: 0, fetched: 0, inserted: 0, skipped: 0 };
    }

    const startedAt = Date.now();
    let cursor = account.backfillCursor ?? null;

    //fresh start: incremental sync will pick up from this moment,
    //everything older comes from the backfill itself
    if (!cursor) await markBackfillStart(email);

    let pages = 0;
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;

    do {
        const page = await fetchMeetingsPage({ apiKey: account.apiKey, cursor });

        const saved = await saveMeetings(email, page.items);
        fetched += page.items.length;
        inserted += saved.inserted;
        skipped += saved.skipped;
        pages += 1;

        cursor = page.nextCursor;
        //progress lands in the database before anything can interrupt us
        await saveBackfillProgress(email, cursor, !cursor);

        //pause between pages, fathom rate limit
        if (cursor && Date.now() - startedAt < timeBudgetMs) {
            await sleep(PAUSE_BETWEEN_PAGES_MS);
        }
    } while (cursor && Date.now() - startedAt < timeBudgetMs);

    //settings page shows the fresh total
    const total = await countMeetings(email);
    await db
        .from('fathom_accounts')
        .update({ meetings_count: total })
        .eq('user_email', email);

    return { done: !cursor, pages, fetched, inserted, skipped, total };
}
