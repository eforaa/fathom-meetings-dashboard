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

//the title shown for a meeting, one rule for the whole app.
//a hand- or ai-set title wins; then a REAL calendar/Zoom name; only for
//nameless calls do we fall back to fathom's "meeting purpose" line — otherwise
//that auto line would hide a meeting's real name.
export function meetingTitle(meeting) {
  return (
    meeting?.custom_title ||
    meeting?.ai_title ||
    (isRealTitle(meeting?.title) ? meeting.title : null) ||
    meeting?.fathom_title ||
    //the raw title here is only ever the generic Zoom placeholder — show a
    //"needs a name" marker instead of «Impromptu Zoom Meeting»
    'No name'
  );
}

//which raw field the shown title actually came from — used by the Records
//page so a person can see the rule working instead of guessing
export function meetingTitleSource(meeting) {
  if (meeting?.custom_title) return 'custom_title';
  if (meeting?.ai_title) return 'ai_title';
  if (isRealTitle(meeting?.title)) return 'title';
  if (meeting?.fathom_title) return 'fathom_title';
  return 'none';
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