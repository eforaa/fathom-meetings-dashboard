//every meeting type, in the order they are offered
export const MEETING_TYPES = [
  'internal_planning',
  'client_meeting',
  'automation',
  'onboarding',
  'other',
];

//types of meetings on readable format
export const TYPE_LABELS = {
  internal_planning: 'Internal planning',
  client_meeting: 'Client meeting',
  automation: 'Automation',
  onboarding: 'Onboarding',
  other: 'Other',
};
//language and format
const LOCALE = 'en-GB';
//timezone
//can be changed if needed
const DISPLAY_TIME_ZONE = 'Europe/Kyiv';
//symbol used when there is no available value
const EM_DASH = '—';

//convert meeting type value into a readable label
export function typeLabel(type) {
  return TYPE_LABELS[type] ?? 'Unclassified';
}

//the raw recording title is "real" unless it's the generic Zoom placeholder
//given to calls that were never named in a calendar
function isRealTitle(title) {
  const raw = String(title ?? '').trim();
  return raw && !/impromptu/i.test(raw) && raw.toLowerCase() !== 'without name';
}

//a meeting can hold three names at once — the user's manual one, Claude's
//generated one, and the original from Fathom — and the user may pin which of
//them to show. that choice lives in custom_fields under this reserved key so
//no name is ever deleted just to display another. null = automatic order.
const TITLE_CHOICE_KEY = '__title_choice';

export function meetingTitleChoice(meeting) {
  const choice = meeting?.custom_fields?.[TITLE_CHOICE_KEY];
  return choice === 'original' || choice === 'ai' || choice === 'custom' ? choice : null;
}

//the title shown for a meeting, one rule for the whole app.
//if the user pinned a source, honour it (and fall through if it's empty);
//otherwise: manual → generated → REAL calendar/Zoom name → fathom's "purpose"
//line → a "needs a name" marker. the pin never deletes the other names.
export function meetingTitle(meeting) {
  const custom = meeting?.custom_title || null;
  const ai = meeting?.ai_title || null;
  const original = meetingOriginalTitle(meeting);
  const choice = meetingTitleChoice(meeting);

  if (choice === 'original' && original) return original;
  if (choice === 'ai' && ai) return ai;
  if (choice === 'custom' && custom) return custom;

  return custom || ai || original || 'No name';
}

//the meeting's ORIGINAL recorded name — what Fathom gave it, before any
//hand or ai renaming. null for nameless "Impromptu Zoom Meeting" calls.
export function meetingOriginalTitle(meeting) {
  if (isRealTitle(meeting?.title)) return meeting.title.trim();
  if (meeting?.fathom_title) return meeting.fathom_title;
  return null;
}

//which raw field the shown title actually came from — used by the Records
//page and the title picker so a person can see the rule working
export function meetingTitleSource(meeting) {
  const custom = meeting?.custom_title || null;
  const ai = meeting?.ai_title || null;
  const realTitle = isRealTitle(meeting?.title);
  const originalSource = realTitle ? 'title' : meeting?.fathom_title ? 'fathom_title' : 'none';
  const choice = meetingTitleChoice(meeting);

  if (choice === 'original' && originalSource !== 'none') return originalSource;
  if (choice === 'ai' && ai) return 'ai_title';
  if (choice === 'custom' && custom) return 'custom_title';

  if (custom) return 'custom_title';
  if (ai) return 'ai_title';
  return originalSource;
}

//the summary shown for a meeting: a hand-edited one wins over the machine one
export function meetingSummary(meeting) {
  return meeting?.custom_summary || meeting?.summary || '';
}

//how many types one meeting may carry
export const MAX_TYPES = 4;

//every type of a meeting as a list
//a hand-picked set wins over the single value left by the analysis
export function meetingTypes(meeting) {
  if (Array.isArray(meeting?.types) && meeting.types.length) {
    return meeting.types.filter((type) => type in TYPE_LABELS);
  }

  return meeting?.meeting_type ? [meeting.meeting_type] : [];
}

//formst date into a readable format
export function formatDate(iso) {
  //if date is missing dashh is returned
  if (!iso) return EM_DASH;

  return new Date(iso).toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
//format start and end time into a time range
export function formatTimeRange(startIso, endIso) {
  //return empty string if start time is missing
  if (!startIso) return '';

  const options = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  };
  //start time format
  const start = new Date(startIso).toLocaleTimeString(LOCALE, options);
  if (!endIso) return start;

  //end time format
  const end = new Date(endIso).toLocaleTimeString(LOCALE, options);
  return `${start}–${end}`;
}

//just the start of a meeting, for the compact row in the list
export function formatTime(iso) {
  if (!iso) return '';

  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

//short date for the list: day and month, without the year
export function formatDayMonth(iso) {
  if (!iso) return EM_DASH;

  return new Date(iso).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

//converting minutes into readable format
export function formatDuration(minutes) {
  if (minutes == null) return EM_DASH;
  if (minutes < 60) return `${minutes} min`;

  //converting minutes into hours
  const hours = Math.floor(minutes / 60);
  //remaining minutes
  const rest = minutes % 60;

  //returning formatted hours and minutes
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function initials(name) {
  if (!name) return '?';

  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}