//base API of url
const BASE_URL = 'https://api.fathom.ai/external/v1';

const MAX_RETRIES = 3;
//creating pause to avoid API rate limits
const PAUSE_BETWEEN_PAGES_MS = 1100;

//help function pause
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//checking whether key is valid
//key comes as a parameter now: every person connects their own account
async function callFathom(path, apiKey, params = {}, attempt = 0) {
  if (!apiKey) throw new Error('Fathom API key is missing');

  //creating request URL
  const url = new URL(BASE_URL + path);

  //query parameters is added to the URL
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.append(name, value);
  }

  //sending request to Fathom
  const response = await fetch(url.toString(), {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });

  //if rate has a limit wait and retry
  if (response.status === 429 && attempt < MAX_RETRIES) {
    const resetSeconds = Number(response.headers.get('RateLimit-Reset') ?? 10);
    await sleep(resetSeconds * 1000 + 500);
    return callFathom(path, apiKey, params, attempt + 1);
  }

  //retry server errors after a short delay
  if (response.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(2000 * (attempt + 1));
    return callFathom(path, apiKey, params, attempt + 1);
  }

  //error after unsuccessful response
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`Fathom ${response.status}: ${body}`);
  }

  //everything went fine, give back the data
  return response.json();
}

//one page of meetings, the caller controls the paging
//backfill needs this: it saves the cursor between pages
export async function fetchMeetingsPage({ apiKey, createdAfter, cursor } = {}) {
  //transcript plus fathom's own summary and action items
  //they come for free and cover most of what our ai used to do
  const params = {
    include_transcript: 'true',
    include_summary: 'true',
    include_action_items: 'true',
  };
  //fetching meeting only after the given date
  if (createdAfter) params.created_after = createdAfter;
  if (cursor) params.cursor = cursor;

  const response = await callFathom('/meetings', apiKey, params);

  return {
    items: response.items ?? [],
    nextCursor: response.next_cursor ?? null,
  };
}

//function to fetch meetings from API
export async function fetchMeetings({ apiKey, createdAfter, maxPages = 20 } = {}) {
  const meetings = [];
  let cursor;
  let page = 0;

  do {
    //adding meetings to the array
    const response = await fetchMeetingsPage({ apiKey, createdAfter, cursor });
    meetings.push(...response.items);

    //saving page cursor
    cursor = response.nextCursor ?? undefined;
    page += 1;

    //implementing a pause before another page request
    if (cursor && page < maxPages) await sleep(PAUSE_BETWEEN_PAGES_MS);
  } while (cursor && page < maxPages);

  return meetings;
}

//converting transcript into text

export function transcriptToText(meeting) {
  //if there is no transcript return empty string
  //a placeholder text would be stored as a real transcript and sent to the model
  if (!meeting.transcript?.length) return '';

  const blocks = [];
  let speaker = null;
  let lines = [];

  //saving all lines to block
  const flush = () => {
    if (speaker) blocks.push(`${speaker}: ${lines.join(' ')}`);
  };

  //going through each line and collect text from current speaker
  for (const line of meeting.transcript) {
    const nextSpeaker = line.speaker?.display_name ?? 'Speaker';
    const text = (line.text ?? '').trim();
    if (!text) continue;

    //adding lines till speaker will not be changed
    if (nextSpeaker === speaker) {
      lines.push(text);
    } else {
      //saving previous speaker text and going to the new one
      flush();
      speaker = nextSpeaker;
      lines = [text];
    }
  }

  //saving last speaker text
  flush();
  return blocks.join('\n');
}

//meeting duration function
export function durationSeconds(meeting) {
  //using recordings or scheduled times
  const start = meeting.recording_start_time ?? meeting.scheduled_start_time;
  const end = meeting.recording_end_time ?? meeting.scheduled_end_time;
  if (!start || !end) return null;

  const seconds = Math.round((new Date(end) - new Date(start)) / 1000);
  //returning duration if only it is a positive value
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

//function for meetings participants
export function extractParticipants(meeting) {
  //creating a map to avoid duplicates
  const byIdentity = new Map();

  //creating one participant using email and name
  const add = (rawName, rawEmail) => {
    const email = rawEmail?.trim().toLowerCase() || null;
    const name = rawName?.trim() || null;
    //email will be as a unique ID, if email does not exist
    //name will be used
    const identity = email || name;

    //if participant exists - skip
    if (!identity || byIdentity.has(identity)) return;

    //save user details by identity, including name, email, and email domain.
    byIdentity.set(identity, {
      name,
      email,
      email_domain: email ? (email.split('@')[1] ?? null) : null,
    });
  };

  //adding calendar meetings users
  for (const invitee of meeting.calendar_invitees ?? []) {
    add(invitee.name, invitee.email);
  }

  //adding speakers from transcript
  for (const line of meeting.transcript ?? []) {
    add(line.speaker?.display_name, line.speaker?.matched_calendar_invitee_email);
  }

  //all unique users
  return [...byIdentity.values()];
}
