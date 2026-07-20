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