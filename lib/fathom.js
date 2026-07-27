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

//a readable title from fathom's summary
//the summary always opens with a "purpose" heading and one line under it,
//that line is a far better title than a generic "Impromptu Zoom Meeting"
export function fathomTitle(summary) {
  if (!summary) return null;

  const lines = summary.split('\n');
  let afterHeading = false;

  for (const raw of lines) {
    const line = raw.trim();

    //walk down to the first "## ..." heading, the purpose goes right after it
    if (!afterHeading) {
      if (line.startsWith('## ')) afterHeading = true;
      continue;
    }

    if (!line) continue;

    //markdown link [text](url) leaves just the text
    let text = line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    //drop bold/italic/code marks and list bullets
    text = text.replace(/[*_`]/g, '').replace(/^[-\d.\s]+/, '').trim();
    if (!text) continue;

    //no trailing period, keep it short
    text = text.replace(/\s*\.\s*$/, '');
    return text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text;
  }

  return null;
}

//one consistent start/end pair for a meeting, plus its length in seconds
//prefer the real recording span, fall back to the scheduled span, but never
//mix the two: a recording end paired with a scheduled start (or the reverse)
//gives spans of years on demo and imported meetings
//no real call runs longer than a day; a span past this means the start and end
//came from different sources (e.g. Fathom's demo rows span years) — reject it
const MAX_SPAN_SECONDS = 24 * 60 * 60;

export function meetingSpan(meeting) {
  const pairs = [
    [meeting.recording_start_time, meeting.recording_end_time],
    [meeting.scheduled_start_time, meeting.scheduled_end_time],
  ];

  for (const [start, end] of pairs) {
    if (!start || !end) continue;
    const seconds = Math.round((new Date(end) - new Date(start)) / 1000);
    //take the first complete pair that makes sense (non-negative, under a day)
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_SPAN_SECONDS) {
      return { start, end, seconds };
    }
  }

  //no complete pair: keep the best start we have for display, no duration
  return {
    start: meeting.recording_start_time ?? meeting.scheduled_start_time ?? null,
    end: meeting.recording_end_time ?? meeting.scheduled_end_time ?? null,
    seconds: null,
  };
}

//meeting duration function
export function durationSeconds(meeting) {
  return meetingSpan(meeting).seconds;
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
