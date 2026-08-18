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

//supabase hands back at most 1000 rows per request, so anything that has to
//return "everything" walks pages with .range() until a short page comes back.
//there used to be a flat limit of 500 here: everything past it never reached
//the screen, and nothing said so
const PAGE_SIZE = 1000;

//a runaway guard, not a product limit — it only fires if paging goes wrong,
//and it says so out loud instead of truncating quietly
const MAX_ROWS = 50_000;

//how many ids fit into one .in() before the request url gets too long
const ID_CHUNK = 300;

//instead undefined returning known format
const EMPTY_RESULT = { meetings: [], participantsByMeeting: new Map() };

//walking one query page by page. build() has to make a FRESH query every call:
//a supabase builder can only be awaited once
async function fetchAllPages(build) {
    const rows = [];

    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
        const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);

        const page = data ?? [];
        rows.push(...page);

        //a short page means there is nothing after it
        if (page.length < PAGE_SIZE) return rows;
    }

    console.error(`queries: stopped at ${MAX_ROWS} rows — paging looks broken`);
    return rows;
}

//running the same query once per chunk of ids, then flattening
//a list of thousands of ids does not fit into one .in()
async function fetchByIds(ids, build) {
    const rows = [];

    for (let i = 0; i < ids.length; i += ID_CHUNK) {
        rows.push(...(await fetchAllPages(() => build(ids.slice(i, i + ID_CHUNK)))));
    }

    return rows;
}

//meetings that contain specific participants
async function findMeetingIdsByParticipants(identities) {
    const rows = await fetchAllPages(() =>
        db
            .from('participants')
            .select('meeting_id')
            .in('identity', identities)
            //a stable order, otherwise page boundaries can drop or repeat a row
            .order('id', { ascending: true }),
    );

    return [...new Set(rows.map((row) => row.meeting_id))];
}

//every meeting id this person owns
async function ownedMeetingIds(ownerEmail) {
    const rows = await fetchAllPages(() =>
        db
            .from('meetings')
            .select('id')
            .eq('owner_email', ownerEmail)
            .order('id', { ascending: true }),
    );

    return rows.map((row) => row.id);
}

//get all participants for meeting
async function loadParticipantsFor(meetings) {
    const data = await fetchByIds(
        meetings.map((meeting) => meeting.id),
        (chunk) =>
            db
                .from('participants')
                .select('id, meeting_id, name, email, identity')
                .in('meeting_id', chunk)
                .order('id', { ascending: true }),
    );

    //using map to distinguish between meetings
    const byMeeting = new Map();
    //group members by meeting id
    for (const person of data) {
        const group = byMeeting.get(person.meeting_id) ?? [];
        group.push(person);
        byMeeting.set(person.meeting_id, group);
    }
    return byMeeting;
}

//ordering a list the way the database would have
//needed when rows came back in chunks, each sorted only within itself
function sortRows(rows, column, ascending) {
    const direction = ascending ? 1 : -1;

    return [...rows].sort((a, b) => {
        const left = a[column];
        const right = b[column];

        //empty values go last in both directions, like nullsFirst: false
        if (left == null && right == null) return a.id < b.id ? -1 : 1;
        if (left == null) return 1;
        if (right == null) return -1;

        if (left !== right) return left < right ? -direction : direction;
        //id breaks the tie, so the order never wobbles between runs
        return a.id < b.id ? -1 : 1;
    });
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

    //filtering by participants: their meeting ids are resolved first
    let ids = null;
    if (participants.length) {
        ids = await findMeetingIdsByParticipants(participants);
        if (!ids.length) return EMPTY_RESULT;
    }

    //sorting by duration or date
    const sortColumn = sort === 'duration' ? 'duration_minutes' : 'date';
    const ascending = dir === 'asc';

    //creating database querry
    const build = (chunk) => {
        let query = db
            .from('meetings')
            .select(LIST_COLUMNS)
            .eq('owner_email', ownerEmail);

        //filtering by meeting type
        if (types.length) query = query.in('meeting_type', types);
        if (chunk) query = query.in('id', chunk);

        //id breaks ties, so a row cannot slip between two pages
        return query
            .order(sortColumn, { ascending, nullsFirst: false })
            .order('id', { ascending: true });
    };

    //getting database result — every page of it
    const meetings = ids
        //chunks are each sorted on their own, so the order is redone here
        ? sortRows(await fetchByIds(ids, build), sortColumn, ascending)
        : await fetchAllPages(() => build(null));

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
    const hits = await fetchAllPages(() =>
        db
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
            )
            .order('id', { ascending: true }),
    );
    for (const row of hits) ids.add(row.id);

    //participant names/emails — scoped to this owner's meetings
    const people = await fetchByIds(await ownedMeetingIds(ownerEmail), (chunk) =>
        db
            .from('participants')
            .select('meeting_id')
            .in('meeting_id', chunk)
            .or(`name.ilike.${like},email.ilike.${like}`)
            .order('id', { ascending: true }),
    );
    for (const row of people) ids.add(row.meeting_id);

    return ids;
}

//getting all participants of this person's meetings
//the dropdown must not show people from someone else's conferences
export async function getAllParticipants(ownerEmail) {
    if (!ownerEmail) return [];

    //first the meetings of this owner
    const meetingIds = await ownedMeetingIds(ownerEmail);
    if (!meetingIds.length) return [];

    const data = await fetchByIds(meetingIds, (chunk) =>
        db
            .from('participants')
            .select('name, email, identity')
            .in('meeting_id', chunk)
            .not('identity', 'is', null)
            .order('id', { ascending: true }),
    );

    //creating map to store users
    const labelByIdentity = new Map();
    for (const person of data) {
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
