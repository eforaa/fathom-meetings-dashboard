import { db } from './supabase.js';
import {
    fetchMeetings,
    transcriptToText,
    durationSeconds,
    extractParticipants,
} from './fathom.js';
import { listAccountsWithKeys, recordSync } from './accounts.js';

//to prevent system to load only one meetings created at the same time
//overlap is going back for 10 minutes
const OVERLAP_MINUTES = 10;

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

    //count
    let inserted = 0;
    let skipped = 0;

    for (const m of meetings) {
        // recording_id coming in integer format
        const recordingId = m.recording_id == null
            ? null : String(m.recording_id);
        //if no recording id
        if (!recordingId) {
            skipped++;
            continue;
        }

        //using start time or scheduled start time
        const startTime = m.recording_start_time ?? m.scheduled_start_time ?? null;
        //using end time or scheduled end time
        const endTime = m.recording_end_time ?? m.scheduled_end_time ?? null;
        const seconds = durationSeconds(m);

        //database row is built
        const row = {
            //who this meeting belongs to
            //the same call can come from two keys and becomes two rows
            owner_email: account.userEmail,
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
            skipped++;
            continue;
        }

        inserted++;

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

    //returning data about the sync process
    return {
        fetched: meetings.length,
        inserted,
        skipped,
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

            //how many meetings this person has in total, shown in settings
            const { count } = await db
                .from('meetings')
                .select('id', { count: 'exact', head: true })
                .eq('owner_email', account.userEmail);

            await recordSync(account.userEmail, {
                ok: true,
                meetingsCount: count ?? 0,
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