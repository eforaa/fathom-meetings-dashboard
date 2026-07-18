//base url for fathom api
const BASE_URL = 'https://api.fathom.ai/external/v1';

//delay funnction to avoid hitting API rate limits 
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//This function is 
//creating URL,
//adding query parameters and adding authentication
async function fathomGet(path, params = {}, attempt = 0) {
  const url = new URL(BASE_URL + path);
  //adding parameters to URL
  for (const [k, v] of Object.entries(params))
     url.searchParams.append(k, v);

  //sending rewuest to fatom api
  const res = await fetch(url.toString(), {
    headers: { 'X-Api-Key': process.env.FATHOM_API_KEY },
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
  if (!m.transcript?.length) return '';
  return m.transcript
    .map((s) => `${s.speaker?.display_name ?? 'Спикер'}: ${s.text ?? ''}`)
    .join('\n');
}

//function to calculate meetings duration in minutes
export function durationMinutes(m) {
  //getting recorded start time or scheduled start time
  const start = m.recording_start_time ?? m.scheduled_start_time;
  const end = m.recording_end_time ?? m.scheduled_end_time;
  if (!start || !end) 
    return null;
  //difference between start and end time will be duration time in minutes
  const min = Math.round((new Date(end) - new Date(start)) / 60000);
  return Number.isFinite(min) && min >= 0 ? min : null;
}