import { db } from './supabase.js';

//recurring-series matcher (Daniil's idea): recognise which regular meeting a
//nameless "Impromptu Zoom Meeting" really is — by PARTICIPANTS + hour-of-day
//(UTC+3) + duration — and give it the series name instead of leaving it blank.
//writes ai_title (marked 🤖, revertable); never touches a real calendar title.

const MIN_PARTICIPANTS = 0.6; //how much the participant set must overlap a series
const isReal = (t) => t && t.trim() && !/impromptu/i.test(t) && t.trim().toLowerCase() !== 'without name';
const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();

//hour of day in Kyiv time (UTC+3), the slot a regular meeting sits in
function hourKyiv(meeting) {
  const t = meeting.start_time || meeting.date;
  if (!t) return null;
  return (new Date(t).getUTCHours() + 3) % 24;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  return shared / (a.size + b.size - shared);
}

//participants per meeting as a Set of email/name keys
async function participantsByMeeting(ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from('participants')
      .select('meeting_id, email, name')
      .in('meeting_id', ids.slice(i, i + 200));
    for (const p of data || []) {
      const key = (p.email || p.name || '').toLowerCase().trim();
      if (key) (map[p.meeting_id] ||= new Set()).add(key);
    }
  }
  return map;
}

//signature of every named series that recurs at least 3 times for this owner:
//its core participants, its usual hour, its median duration
export async function buildSeriesSignatures(ownerEmail) {
  const { data: named } = await db
    .from('meetings')
    .select('id, title, date, start_time, duration_minutes')
    .eq('owner_email', ownerEmail)
    .limit(2000);

  const real = (named || []).filter((m) => isReal(m.title));
  if (!real.length) return [];

  const parts = await participantsByMeeting(real.map((m) => m.id));
  const grouped = {};
  for (const m of real) (grouped[norm(m.title)] ||= { title: m.title.trim(), items: [] }).items.push(m);

  return Object.values(grouped)
    .filter((s) => s.items.length >= 3)
    .map((s) => {
      const cnt = {};
      for (const m of s.items) for (const p of parts[m.id] || []) cnt[p] = (cnt[p] || 0) + 1;
      const core = new Set(
        Object.entries(cnt).filter(([, c]) => c >= s.items.length * 0.5).map(([p]) => p),
      );
      const hist = {};
      for (const m of s.items) {
        const h = hourKyiv(m);
        if (h != null) hist[h] = (hist[h] || 0) + 1;
      }
      const modeHour = Number(Object.entries(hist).sort((a, b) => b[1] - a[1])[0]?.[0]);
      const durs = s.items.map((m) => m.duration_minutes || 0).sort((a, b) => a - b);
      return { title: s.title, core, modeHour, medDur: durs[Math.floor(durs.length / 2)] };
    });
}

//best matching series title for one meeting, or null when nothing is confident.
//confident = participant overlap high enough AND the time slot lines up.
export function matchToSeries(meeting, participantSet, series, min = MIN_PARTICIPANTS) {
  const h = hourKyiv(meeting);
  let best = null;
  for (const s of series) {
    const j = jaccard(participantSet, s.core);
    const hourOk = h != null && Math.abs(((h - s.modeHour + 12) % 24) - 12) <= 1;
    if (j >= min && hourOk && (!best || j > best.j)) best = { title: s.title, j };
  }
  return best ? best.title : null;
}

//name freshly-ingested nameless meetings by matching them to the owner's series.
//`fresh` = [{ id, title, date, start_time, duration_minutes }] as just inserted.
//only writes ai_title (🤖) on a confident match; the rest stay "No name",
//which is exactly how they surface in the dashboard for a human to fix.
export async function autoNameImpromptu(ownerEmail, fresh) {
  const nameless = (fresh || []).filter(
    (m) => !isReal(m.title),
  );
  if (!nameless.length) return { named: 0, checked: 0 };

  const series = await buildSeriesSignatures(ownerEmail);
  if (!series.length) return { named: 0, checked: nameless.length };

  const parts = await participantsByMeeting(nameless.map((m) => m.id));
  let named = 0;
  for (const m of nameless) {
    const title = matchToSeries(m, parts[m.id] || new Set(), series);
    if (!title) continue;
    const { error } = await db
      .from('meetings')
      .update({ ai_title: title })
      .eq('id', m.id)
      .eq('owner_email', ownerEmail);
    if (!error) named += 1;
  }
  return { named, checked: nameless.length };
}
