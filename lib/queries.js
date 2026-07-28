import { db } from './supabase.js';

//columns to get
const LIST_COLUMNS = [
    'id',
    'recording_id',
    'title',
    'ai_title',
    'fathom_title',
    'custom_title',
    'date',
    'duration_minutes',
    'meeting_type',
    'types',
    'key_topics',
    'recording_url',
    'analysis_status',
    'importance',
    'custom_fields',
].join(', ');

const LIST_LIMIT = 500;
//instead undefined returning known format
const EMPTY_RESULT = { meetings: [], participantsByMeeting: new Map() };

//meetings that contain specific participants
async function findMeetingIdsByParticipants(identities) {
    const { data } = await db
        .from('participants')
        .select('meeting_id')
        .in('identity', identities);

    return [...new Set((data ?? []).map((row) => row.meeting_id))];
}

//get all participants for meeting
async function loadParticipantsFor(meetings) {
    const { data } = await db
        .from('participants')
        .select('id, meeting_id, name, email, identity')
        .in('meeting_id', meetings.map((meeting) => meeting.id));

    //using map to distinguish between meetings
    const byMeeting = new Map();
    //group members by meeting id
    for (const person of data ?? []) {
        const group = byMeeting.get(person.meeting_id) ?? [];
        group.push(person);
        byMeeting.set(person.meeting_id, group);
    }
    return byMeeting;
}

//getting meetings by filters
//ownerEmail is required: without it a person would see everyone's meetings
export async function getMeetings({
    ownerEmail,
    types = [],
    participants = [],
    sort = 'date',
    dir = 'desc',
} = {}) {
    //no owner means nobody to show meetings for
    if (!ownerEmail) return EMPTY_RESULT;

    //creating database querry
    let query = db
        .from('meetings')
        .select(LIST_COLUMNS)
        .eq('owner_email', ownerEmail);

    //filtering by meeting type
    if (types.length) {
        query = query.in('meeting_type', types);
    }

    //filtering by participants
    if (participants.length) {
        const ids = await findMeetingIdsByParticipants(participants);
        if (!ids.length) return EMPTY_RESULT;

        query = query.in('id', ids);
    }

    //sorting by duration or date
    const sortColumn = sort === 'duration' ? 'duration_minutes' : 'date';
    query = query.order(sortColumn, { ascending: dir === 'asc', nullsFirst: false });

    //getting database result
    const { data, error } = await query.limit(LIST_LIMIT);
    if (error) throw new Error(error.message);

    const meetings = data ?? [];
    if (!meetings.length) return EMPTY_RESULT;

    //returning result
    return {
        meetings,
        participantsByMeeting: await loadParticipantsFor(meetings),
    };
}

//full-text search across a person's meetings — titles, summaries, the raw
//transcript, and participant names/emails. returns a Set of matching meeting
//ids, or null when there's nothing to search for (so callers show everything).
export async function searchMeetingIds(ownerEmail, rawTerm) {
    const term = String(rawTerm ?? '').replace(/[,()%*]/g, ' ').trim();
    if (!ownerEmail || term.length < 2) return null;

    const like = `%${term}%`;
    const ids = new Set();

    //text columns on the meeting itself (transcript included)
    const { data: hits } = await db
        .from('meetings')
        .select('id')
        .eq('owner_email', ownerEmail)
        .or(
            [
                `title.ilike.${like}`,
                `ai_title.ilike.${like}`,
                `custom_title.ilike.${like}`,
                `fathom_title.ilike.${like}`,
                `fathom_summary.ilike.${like}`,
                `summary.ilike.${like}`,
                `raw_transcript.ilike.${like}`,
            ].join(','),
        );
    for (const row of hits ?? []) ids.add(row.id);

    //participant names/emails — scoped to this owner's meetings
    const { data: owned } = await db.from('meetings').select('id').eq('owner_email', ownerEmail);
    const ownedIds = (owned ?? []).map((row) => row.id);
    for (let i = 0; i < ownedIds.length; i += 300) {
        const { data: people } = await db
            .from('participants')
            .select('meeting_id')
            .in('meeting_id', ownedIds.slice(i, i + 300))
            .or(`name.ilike.${like},email.ilike.${like}`);
        for (const row of people ?? []) ids.add(row.meeting_id);
    }

    return ids;
}

//getting all participants of this person's meetings
//the dropdown must not show people from someone else's conferences
export async function getAllParticipants(ownerEmail) {
    if (!ownerEmail) return [];

    //first the meetings of this owner
    const { data: owned } = await db
        .from('meetings')
        .select('id')
        .eq('owner_email', ownerEmail);

    const meetingIds = (owned ?? []).map((row) => row.id);
    if (!meetingIds.length) return [];

    const { data } = await db
        .from('participants')
        .select('name, email, identity')
        .in('meeting_id', meetingIds)
        .not('identity', 'is', null);

    //creating map to store users
    const labelByIdentity = new Map();
    for (const person of data ?? []) {
        //avoiding duplicates
        if (labelByIdentity.has(person.identity)) continue;

        //creating label
        const label =
            person.name ||
            (person.email
                ? person.email.split('@')[0].replace(/[._-]/g, ' ')
                : person.identity);

        labelByIdentity.set(person.identity, label);
    }

    //converting the map of users into an array and sort them by name
    return [...labelByIdentity.entries()]
        .map(([identity, label]) => ({ identity, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

//getting meeting by id
//owner is checked here too, otherwise a known id would open someone else's meeting
export async function getMeeting(id, ownerEmail) {
    if (!ownerEmail) return null;

    //getting meeting from database
    const { data: meeting } = await db
        .from('meetings')
        .select('*')
        .eq('id', id)
        .eq('owner_email', ownerEmail)
        .maybeSingle();

    //checking if meeting exists
    if (!meeting) return null;

    //getting participants
    const { data: participants } = await db
        .from('participants')
        .select('id, name, email, email_domain')
        .eq('meeting_id', id);

    //final result
    return { meeting, participants: participants ?? [] };
}