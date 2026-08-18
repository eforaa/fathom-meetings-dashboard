import { DEFAULT_LANG, LOCALES, t } from './i18n/index.js';

//every meeting type, in the order they are offered
export const MEETING_TYPES = [
  'internal_planning',
  'client_meeting',
  'automation',
  'onboarding',
  'other',
];

//the readable names of the types live in the dictionaries (lib/i18n), so they
//follow the chosen language like everything else on screen
//timezone
//can be changed if needed
const DISPLAY_TIME_ZONE = 'Europe/Kyiv';
//symbol used when there is no available value
const EM_DASH = '—';

//the locale Intl should format with. the time zone above is NOT part of it:
//meetings are always shown in Kyiv time, whatever the language
function locale(lang) {
  return LOCALES[lang] ?? LOCALES[DEFAULT_LANG];
}

//convert meeting type value into a readable label
export function typeLabel(type, lang = DEFAULT_LANG) {
  return MEETING_TYPES.includes(type) ? t(lang, `types.${type}`) : t(lang, 'types.unclassified');
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
//otherwise: manual → REAL calendar/Zoom name → generated → fathom's "purpose"
//line → a "needs a name" marker.
//a real calendar name outranks a generated one so analysis can never quietly
//overwrite a meeting that Fathom already named from the calendar; the user can
//still pin the generated name per meeting. the pin never deletes other names.
export function meetingTitle(meeting, lang = DEFAULT_LANG) {
  const custom = meeting?.custom_title || null;
  const real = isRealTitle(meeting?.title) ? meeting.title.trim() : null;
  const ai = meeting?.ai_title || null;
  const fathom = meeting?.fathom_title || null;
  const choice = meetingTitleChoice(meeting);

  if (choice === 'original' && (real || fathom)) return real || fathom;
  if (choice === 'ai' && ai) return ai;
  if (choice === 'custom' && custom) return custom;

  return custom || real || ai || fathom || t(lang, 'title.noName');
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
  if (realTitle) return 'title';
  if (ai) return 'ai_title';
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
    return meeting.types.filter((type) => MEETING_TYPES.includes(type));
  }

  return meeting?.meeting_type ? [meeting.meeting_type] : [];
}

//formst date into a readable format
export function formatDate(iso, lang = DEFAULT_LANG) {
  //if date is missing dashh is returned
  if (!iso) return EM_DASH;

  return new Date(iso).toLocaleDateString(locale(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
//format start and end time into a time range
export function formatTimeRange(startIso, endIso, lang = DEFAULT_LANG) {
  //return empty string if start time is missing
  if (!startIso) return '';

  const options = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  };
  //start time format
  const start = new Date(startIso).toLocaleTimeString(locale(lang), options);
  if (!endIso) return start;

  //end time format
  const end = new Date(endIso).toLocaleTimeString(locale(lang), options);
  return `${start}–${end}`;
}

//just the start of a meeting, for the compact row in the list
export function formatTime(iso, lang = DEFAULT_LANG) {
  if (!iso) return '';

  return new Date(iso).toLocaleTimeString(locale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

//short date for the list: day and month, without the year
export function formatDayMonth(iso, lang = DEFAULT_LANG) {
  if (!iso) return EM_DASH;

  return new Date(iso).toLocaleDateString(locale(lang), {
    day: 'numeric',
    month: 'short',
  });
}

//converting minutes into readable format
export function formatDuration(minutes, lang = DEFAULT_LANG) {
  if (minutes == null) return EM_DASH;
  if (minutes < 60) return t(lang, 'duration.min', { n: minutes });

  //converting minutes into hours
  const hours = Math.floor(minutes / 60);
  //remaining minutes
  const rest = minutes % 60;

  //returning formatted hours and minutes
  return rest
    ? t(lang, 'duration.hourMin', { h: hours, m: rest })
    : t(lang, 'duration.hour', { n: hours });
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