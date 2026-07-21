//creating meetings cathegories
export const MEETING_TYPES = [
  'internal_planning',
  'client_meeting',
  'automation',
  'onboarding',
  'other',
];
//default ai model
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';
//max amount of retries
const MAX_RETRIES = 3;
// AI temperature values for retry attempts
const ATTEMPTS = [
  { temperature: 0.3, maxChars: 60_000 },
  { temperature: 0, maxChars: 30_000 },
];
//ai instruction to return transcript in json format
const SYSTEM_PROMPT = `You analyze business meetings. You receive a meeting transcript.
Reply with a valid JSON object ONLY. No markdown, no code fences, no text before or after.

Response format:
{
  "title": "3-6 words describing what this meeting was actually about",
  "summary": "3-5 sentences: what was discussed and what was decided",
  "key_topics": ["topic 1", "topic 2"],
  "meeting_type": "internal_planning",
  "action_items": [{"assignee": "name or null", "task": "what needs to be done"}]
}

Meeting types, pick exactly one:
- internal_planning - team standup, status updates, task distribution inside the company
- client_meeting - an external party takes part: client, customer, partner
- automation - discussing process automation, integrations, tooling rollout
- onboarding - training, bringing someone up to speed, product demo for a new person
- other - anything else

Rules:
- Write everything in English: title, summary, key topics and action items.
  The transcript is usually Russian, so translate rather than copy. Keep
  product names, technical terms and people's names exactly as they were said.
- title: a specific headline. Never reuse the original meeting title.
- key_topics: 3 to 7 short phrases, not sentences.
- action_items: only explicit commitments where someone takes on work.
  assignee is the person's name as it was said in the conversation, or null
  if nobody was named. Return an empty array if there were no commitments.
- If the transcript contains a note about an omitted middle section, work
  with what is there and do not mention missing data in the summary.
- When a meeting matches more than one type, prefer the specific one over
  internal_planning. Choose internal_planning only when the meeting is really
  about team status and task distribution. If the conversation is mostly about
  building an integration, rolling out a tool or automating a process, that is
  automation, even though the team discussed it internally.
  - internal_planning - status updates and task distribution, when no single
  subject dominates the conversation`;
  //pause between retries
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

 function truncateTranscript(text, maxChars) {
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize;

  return [
    //getting start of the text till headSize limit
    text.slice(0, headSize),
    '[...middle of the meeting omitted due to length...]',
    //getting rest by starting from the end and going to the tailSIze
    text.slice(-tailSize),
  ].join('\n\n');
}

//removes makdown and extracts JSON from AI
function extractJsonBlock(raw) {
  let text = raw.trim();//removing extra space
  // remove JSON markdown code fences (```json ... ```)
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  //finding start of JSON
  const start = text.indexOf('{');
  //finding end of JSON
  const end = text.lastIndexOf('}');
  //keeping only vital JSON part
  if (start !== -1 && end > start) 
    text = text.slice(start, end + 1);
  return text;
}

//checking if ai gives valid result
function normalizeAnalysis(parsed) {
    //if type contain one of existing types insert in found meeting type
    //else - other type
  const meetingType = MEETING_TYPES.includes(parsed?.meeting_type)
    ? parsed.meeting_type
    : 'other';

    //checking if key topics are array
    //isolating topics and keeping maaximum 10
  const keyTopics = Array.isArray(parsed?.key_topics)
    ? parsed.key_topics
        .filter((topic) => typeof topic === 'string' && topic.trim())
        .map((topic) => topic.trim())
        .slice(0, 10)
    : [];

    //checking if tasks ar array
  const actionItems = Array.isArray(parsed?.action_items)
    ? parsed.action_items
        .map((item) =>
          typeof item === 'string'
            ? { assignee: null, task: item.trim() }
            //returns an object
            : {
                assignee: item?.assignee || null,
                // some models call this field "text" instead of "task"
                task: String(item?.task ?? item?.text ?? '').trim(),
              },
        )
        //removing empry tasks
        .filter((item) => item.task)
    : [];

    //returning results
  return {
    title: typeof parsed?.title === 'string' ? parsed.title.trim().slice(0, 120) : '',
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : '',
    key_topics: keyTopics,
    meeting_type: meetingType,
    action_items: actionItems,
  };
}

//creates message that will be sent to AI
function buildPrompt(transcript, context, maxChars) {
  const parts = [];

  //meeting title
  if (context.title) {
    parts.push('Transcript:', truncateTranscript(transcript, maxChars));
  }
  //checking if participants exists
  if (context.participants?.length) {
    //converts participants into text
    const list = context.participants
      .map((person) =>
        person.email ? `${person.name ?? person.email} <${person.email}>` : person.name,
      )
      //removes empty values
      .filter(Boolean)
      //join users
      .join(', ');

      //addding paticipants to the prompt
    if (list) parts.push(`Participants: ${list}`);
  }

  //adding transcript
  parts.push('Transcript:', truncateTranscript(transcript));
//combining everything together
  return parts.join('\n\n');
}

//sends prompt to OpenRouter and gets the result
//prompt- meeting info
//temperature- ai creativity level
async function callOpenRouter(prompt, temperature, attempt = 0) {
  //getting openRouter API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    //error handling
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
//sending request to API
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
      temperature,
      max_tokens: 8000,

      reasoning: { exclude: true },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });
  //if too many request were sent
  //system waits
  if (response.status === 429 && attempt < MAX_RETRIES) {
    await sleep(5000 * (attempt + 1));
    //recursion
    return callOpenRouter(prompt, temperature, attempt + 1);
  }

  //converting response into JavaScript object
  const data = await response.json();

 //error handling
  if (data?.error) {
    const code = data.error.code ?? data.error.metadata?.code;

    if (code === 429 && attempt < MAX_RETRIES) {
      await sleep(5000 * (attempt + 1));
      return callOpenRouter(prompt, temperature, attempt + 1);
    }

    const details = data.error.metadata?.raw ?? '';
    throw new Error(`OpenRouter: ${data.error.message ?? ''} ${details}`.trim());
  }

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}`);
  }

  const message = data?.choices?.[0]?.message;
  const content = message?.content?.trim() || message?.reasoning?.trim();
  if (!content) throw new Error('OpenRouter returned an empty response');

  return content;
}
export async function analyzeTranscript(transcript, context = {}) {
  //checks if transcript contains any data
    if (!transcript?.trim()) throw new Error('Empty transcript');
//creating a prompt for ai
  let lastError;
    //different temperatures for avoiding system failure
  for (const {temperature,maxChars} of ATTEMPTS) {
    try {
      const prompt = buildPrompt(transcript, context, maxChars);
      const reply = await callOpenRouter(prompt, temperature);
      //converts ai JSON into JS object
      const analysis = normalizeAnalysis(JSON.parse(extractJsonBlock(reply)));
      //error handling
      if (!analysis.summary) throw new Error('model returned no summary');
      return analysis;
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Analysis failed: ${reason}`);
}
