import { db } from './supabase.js';
import {
    fetchMeetings,
    transcriptToText,
    durationSeconds,
    extractParticipants,
} from './fathom.js';

//to prevent system to load only one meetings created at the same time
//overlap is going back for 10 minutes
const OVERLAP_MINUTES = 10;

//finding the last synced meeting date from the database
async function lastSyncPoint() {
    const { data, error } = await db
        .from('meetings')
        //selecting meeting with value created at
        //ignoring meeting without this data
        .select('fathom_created_at')
        .not('fathom_created_at', 'is', null)
        //meetings are sorted in descending order
        .order('fathom_created_at', { ascending: false })
        //getting only latest meetings
        .limit(1);
    //if database request failed - stop
    if (error) {
        throw new Error(`Can not read synchronization point  ${error.message}`);
    }

    const last = data?.[0]?.fathom_created_at;
    //if no previous sync using default date
    if (!last) return process.env.INITIAL_SINCE ?? '2025-01-01T00:00:00Z';

    //going back 10 minutes to avoid missing meetings
    return new Date(
        new Date(last).getTime() - OVERLAP_MINUTES * 60_000
    ).toISOString();
}

//getting meeting from Fathom and saving them to database
export async function runIngest({ since: forcedSince, maxPages } = {}) {
    //using provided date or find the last synchronization point
    const since = forcedSince ?? (await lastSyncPoint());
    //getting meeting that are made after this date
    const meetings = await fetchMeetings({
        createdAfter: since, maxPages
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
        const { data, error } = await db
            .from('meetings')
            .upsert(row, { onConflict: 'recording_id', ignoreDuplicates: true })
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
        //svaing participants who were in this meeting
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