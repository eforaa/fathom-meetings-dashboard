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
//transcript size sent to ai
const MAX_TRANSCRIPT_CHARS = 60_000;
//number of retries if request will fail
const MAX_RETRIES = 3;
// AI temperature values for retry attempts
const TEMPERATURES = [0.3, 0];
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
  with what is there and do not mention missing data in the summary.`;

  //pause between retries
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function truncateTranscript(text) {
    //if transcript is in valid range return full text
  if (text.length <= MAX_TRANSCRIPT_CHARS) 
    return text;

  //if its too long return 60% of the size ( from the beggining and from the end)
  const headSize = Math.floor(MAX_TRANSCRIPT_CHARS * 0.6);
  const tailSize = MAX_TRANSCRIPT_CHARS - headSize;

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
