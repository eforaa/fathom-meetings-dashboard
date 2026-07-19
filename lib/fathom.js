//base url for fathom api
const BASE_URL = 'https://api.fathom.ai/external/v1';

//delay funnction to avoid hitting API rate limits 
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//This function is 
//creating URL,
//adding query parameters and adding authentication
async function fathomGet(path, params = {}, attempt = 0) {
   const key = process.env.FATHOM_API_KEY;
  if (!key) throw new Error('FATHOM_API_KEY відсутній');

  const url = new URL(BASE_URL + path);
  //adding parameters to URL
  for (const [k, v] of Object.entries(params))
     url.searchParams.append(k, v);

  //sending rewuest to fatom api
  const res = await fetch(url.toString(), {
    headers: { 'X-Api-Key': process.env.FATHOM_API_KEY },
    cahce: 'no-store',
  });

  // if error will appear, system will not fall immediately
  // instead system will wait until fathom allows to try again (3 attempts maximum)
  if (res.status === 429 && attempt < 3) {
    const reset = Number(res.headers.get('RateLimit-Reset') ?? 10);
  //wait before trying
    await sleep(reset * 1000 + 500);
  //calling the same function and increasing number of attempts
    return fathomGet(path, params, attempt + 1);
  }

  if (res.status >= 500 && attempt < 3) {
    await sleep(2000 * (attempt + 1));
    return fathomGet(path, params, attempt + 1);
  }
  //error handling
  if (!res.ok) {
    throw new Error(`Fathom ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

//function to get meetings from fathom
export async function fetchMeetings({ createdAfter, maxPages = 200 } = {}) {
 //array for storing all meetings 
  const all = [];
//cursor for pagination
  let cursor;
  let page = 0;

  do {
  //parameters with transcripts
    const params = { 
      include_transcript: 'true' 
    };
  // condition for dates. getting meetings created only after this date
    if (createdAfter) 
      params.created_after = createdAfter;
  //if another page exist. curson is getting to it
    if (cursor) 
      params.cursor = cursor;
  //getting one page of meetings from fathom
    const data = await fathomGet('/meetings', params);
  //adding revieved data to array
    all.push(...(data.items ?? []));
  //cursor saved for the next page
    cursor = data.next_cursor ?? undefined;
  //page counter + 1
    page++;

  //to avoid rate limit erros, waiting between requests implemented
    if (cursor && page < maxPages) await sleep(1100);
  //loop is working before maximum amount of limits is reached
  //and there are more pages 
  } while 
  (cursor && page < maxPages);

  return all;
}

//function to convert transcript to text
export function transcriptToText(m) {
  //if no text found - return
  //else - data will be converted in format:
  //speaker name: message
  //and finally all lines will be combined in one big text
  const blocks = [];
  let currentSpeaker = null;
  let currentText = [];
 
  //converting transctiption tot the plain text
  for (const line of m.transcript) {
    const speaker = line.speaker?.display_name ?? 'Спикер';
    const text = (line.text ?? '').trim();
    if (!text) continue;
 
    if (speaker === currentSpeaker) {
      currentText.push(text);
    } else {
      if (currentSpeaker) blocks.push(`${currentSpeaker}: ${currentText.join(' ')}`);
      currentSpeaker = speaker;
      currentText = [text];
    }
  }
 
  if (currentSpeaker) blocks.push(`${currentSpeaker}: ${currentText.join(' ')}`);
  return blocks.join('\n');
}

//function to calculate meetings duration in minutes
export function durationMinutes(m) {
  //getting recorded start time or scheduled start time
  const start = m.recording_start_time ?? m.scheduled_start_time;
  const end = m.recording_end_time ?? m.scheduled_end_time;
  if (!start || !end) 
    return null;
  //difference between start and end time will be duration time in minutes
  const sec = Math.round((new Date(end) - new Date(start)) / 1000);
  return Number.isFinite(sec) && sec >= 0 ? sec : null;
}

// participants come from two sources: calendar invites and speakers
// for unscheduled meetings, there is no
// calendar event at all, so the email is often null — in that case,
// we identify the person by their name.
export function extractParticipants(m) {
  const byKey = new Map();
 
  const add = (rawName, rawEmail) => {
    const email = rawEmail?.trim().toLowerCase() || null;
    const name = rawName?.trim() || null;
    const key = email || name;
    if (!key || byKey.has(key)) return;
 
    byKey.set(key, {
      name,
      email,
      //getting domain only from email
      email_domain: email ? email.split('@')[1] ?? null : null,
    });
  };
 
  for (const inv of m.calendar_invitees ?? []) {
    add(inv.name, inv.email);
  }
 
  for (const line of m.transcript ?? []) {
    add(line.speaker?.display_name, line.speaker?.matched_calendar_invitee_email);
  }
  return [...byKey.values()];
}
