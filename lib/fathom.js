//base API of url
const BASE_URL = 'https://api.fathom.ai/external/v1';

const MAX_RETRIES = 3;
//creating pause to avoid API rate limits
const PAUSE_BETWEEN_PAGES_MS = 1100;

//help functioon pause
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//checking whether key is valid
async function callFathom(path, params = {}, attempt = 0) {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) throw new Error('FATHOM_API_KEY is not set');

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
    return callFathom(path, params, attempt + 1);
  }

  //retry server errors after a short delay
  if (response.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(2000 * (attempt + 1));
    return callFathom(path, params, attempt + 1);
  }

  //error after unseccessful response 
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`Fathom ${response.status}: ${body}`);
  }

  return response.json();
}

//Fuction to fetch meeting from API
export async function fetchMeetings({ createdAfter, maxPages = 20 } = {}) {
  const meetings = [];
  let cursor;
  let page = 0;

  do {
    //transcript request
    const params = { include_transcript: 'true' };
    //fetching meeting only after the given date
    if (createdAfter) params.created_after = createdAfter;
    if (cursor) params.cursor = cursor;

    //adding meetings to the array
    const response = await callFathom('/meetings', params);
    meetings.push(...(response.items ?? []));

    //saving page cursor
    cursor = response.next_cursor ?? undefined;
    page += 1;

    //implementing a pause before another page request
    if (cursor && page < maxPages) await sleep(PAUSE_BETWEEN_PAGES_MS);
  } while (cursor && page < maxPages);

  return meetings;
}

//converting transcript into text

export function transcriptToText(meeting) {

  //if there is no meeting return message 
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
      //saving previos speaker text and going to the new one
      flush();
      speaker = nextSpeaker;
      lines = [text];
    }
  }

  //saving last speaker text
  flush();
  return blocks.join('\n');
}

//meeting duration fuction 
export function durationSeconds(meeting) {
  //using recordinngs or scheduled times
  const start = meeting.recording_start_time ?? meeting.scheduled_start_time;
  const end = meeting.recording_end_time ?? meeting.scheduled_end_time;
  if (!start || !end) return null;

  const seconds = Math.round((new Date(end) - new Date(start)) / 1000);
  //returning duration if only it is a posititve value
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
    //email wiil be as a unique ID, if email does not exists
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
  //adding  calendar meetings users
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
