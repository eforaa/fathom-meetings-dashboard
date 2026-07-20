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

