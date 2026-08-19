import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings, searchMeetingIds } from '@/lib/queries';
import {
  formatDayMonth,
  formatTime,
  formatDuration,
  meetingTypes,
  meetingTitle,
  meetingTitleSource,
  meetingSummary,
  typeLabel,
  MEETING_TYPES,
} from '@/lib/format';
import {
  applySlots,
  applyColumnFilters,
  collectFacets,
  readView,
  groupMeetingsTree,
  flattenTree,
} from '@/lib/tags';
import { createClientForServer } from '@/lib/supabase-auth';
import { getLang } from '@/lib/i18n/server';
import { t, plural } from '@/lib/i18n';
import LangSwitch from './lang-switch';
import Avocado from './avocado';
import { listColumns } from '@/lib/columns';
import Outline from './outline';
import Stars from './stars';
import EditableTitle from './editable-title';
import TypePicker from './type-picker';
import CustomCell from './custom-cell';
import ColumnManager, { ColumnHeader } from './column-manager';
import Slot from './slot';
import SignOut from './signout';
import ThemeToggle from './toggle';
import SortableHeader from './sortable-header';
import NamelessFilter from './nameless-filter';
import SearchBox from './search-box';
import Stats, { TypesBar } from './stats';
import styles from './page.module.css';

//a meeting longer than a day is broken data, not a real call — leave it out of
//the totals so one bad row can't skew the hours
const SANE_MINUTES = 24 * 60;

//key numbers for the stats band, computed over the whole account
function computeStats(meetings, lang) {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  let totalMinutes = 0;
  let counted = 0;
  let week = 0;
  let month = 0;

  for (const meeting of meetings) {
    const minutes = meeting.duration_minutes;
    if (minutes && minutes <= SANE_MINUTES) {
      totalMinutes += minutes;
      counted += 1;
    }
    if (meeting.date) {
      const d = new Date(meeting.date);
      if (d >= weekAgo && d <= now) week += 1;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += 1;
    }
  }

  const typeCount = new Map();
  let untyped = 0;
  for (const meeting of meetings) {
    const ts = meetingTypes(meeting);
    if (ts.length === 0) untyped += 1;
    for (const t of ts) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  }
  const types = MEETING_TYPES
    .map((key) => ({ key, label: typeLabel(key, lang), count: typeCount.get(key) ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  //most calls have no type yet — show it, so the gap is visible
  if (untyped > 0) types.push({ key: '__untyped', label: t(lang, 'group.noType'), count: untyped });

  return {
    total: meetings.length,
    hours: Math.round(totalMinutes / 60),
    week,
    month,
    avg: counted ? Math.round(totalMinutes / counted) : 0,
    types,
  };
}

//a meeting "needs a name" when all it shows is a placeholder — the raw Fathom
//purpose line or nothing at all
const NEEDS_NAME = new Set(['fathom_title', 'none']);

export const dynamic = 'force-dynamic';

//the six built-in tracks; custom columns are appended after them
//Date first (Alexander's ask), then Meeting, Types, Duration, People, Priority
const BUILTIN_GRID = '104px minmax(230px, 2.2fr) 148px 126px minmax(150px, 1.1fr) 84px';

//track width by custom column type
function trackWidth(type) {
  if (type === 'checkbox') return '58px';
  if (type === 'number') return '84px';
  if (type === 'select') return '118px';
  if (type === 'multiselect') return '158px';
  return '128px';
}

const VISIBLE_AVATARS = 3;

//main meeting page
//reading the view from the url, loading meetings, applying it
export default async function MeetingsPage({ searchParams }) {
  const sp = await searchParams;
  const { slots, groups: groupTags } = readView(sp);
  const lang = await getLang();

  //who is signed in
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  //all meetings of this person, the view is applied after
  const { meetings: all, participantsByMeeting } = await getMeetings({
    ownerEmail: user?.email,
  });

  //custom columns this person added, shown after the built-in ones
  const columns = await listColumns(user?.email);
  const gridStyle = {
    '--grid': [BUILTIN_GRID, ...columns.map((column) => trackWidth(column.type))].join(' '),
  };

  //values for the filter chips are collected before filtering,
  //otherwise choosing one value would hide all the others
  const facetsBySlot = slots.map((slot) =>
    slot.tag ? collectFacets(all, participantsByMeeting, slot.tag, lang) : [],
  );

  //per-column filters from the table header (multi-value, AND across columns)
  const FILTERABLE = ['type', 'people', 'importance'];
  const columnFilters = Object.fromEntries(
    FILTERABLE.map((tag) => [tag, String(sp[`c_${tag}`] ?? '').split('~').filter(Boolean)]),
  );
  const facetsByTag = Object.fromEntries(
    FILTERABLE.map((tag) => [tag, collectFacets(all, participantsByMeeting, tag, lang)]),
  );

  //global search (?q=) over titles, summaries, transcripts and participants
  const query = String(sp.q ?? '').trim();
  const searchIds = query.length >= 2 ? await searchMeetingIds(user?.email, query) : null;
  const searched = searchIds ? all.filter((m) => searchIds.has(m.id)) : all;

  const filtered = applyColumnFilters(searched, participantsByMeeting, columnFilters, lang);
  const sorted = applySlots(filtered, participantsByMeeting, slots, lang);

  //optional "needs a name" view (?nameless=1) plus its live count for the badge
  const namelessCount = all.filter((m) => NEEDS_NAME.has(meetingTitleSource(m))).length;
  const onlyNameless = sp.nameless === '1';
  const meetings = onlyNameless
    ? sorted.filter((m) => NEEDS_NAME.has(meetingTitleSource(m)))
    : sorted;

  //the longest meeting on screen sets the scale of the duration bars.
  //ignore absurd values (a broken multi-day span would flatten every real bar)
  const SANE_MAX_MINUTES = 24 * 60;
  const longest = meetings.reduce(
    (max, meeting) => {
      const m = meeting.duration_minutes ?? 0;
      return m > SANE_MAX_MINUTES ? max : Math.max(max, m);
    },
    0,
  );

  //groups are built on the already sorted list, so their order follows the sort.
  //a nested tree when several grouping levels are chosen (Alexander's 3 columns);
  //flattened into rows + a per-row group path that drives the outline gutter
  //walked once and shared: the band above the table and the type split in the
  //sidebar are two views of the same numbers
  const stats = all.length ? computeStats(all, lang) : null;

  const tree = groupTags.length
    ? groupMeetingsTree(meetings, participantsByMeeting, groupTags, lang)
    : null;
  const flat = tree ? flattenTree(tree) : null;
  const outlineMeta = flat ? flat.map((entry) => ({ id: entry.meeting.id, path: entry.path })) : null;
  //the gutter takes one 22px column per grouping level; the head shifts to match
  const gutterPad = groupTags.length ? groupTags.length * 22 : 0;

  //one row, rendered the same way inside a group and without one
  const row = (meeting) => (
    <MeetingRow
      key={meeting.id}
      meeting={meeting}
      participants={participantsByMeeting.get(meeting.id) ?? []}
      longest={longest}
      columns={columns}
      lang={lang}
    />
  );

  const card = (meeting) => (
    <MeetingCard
      key={meeting.id}
      meeting={meeting}
      participants={participantsByMeeting.get(meeting.id) ?? []}
      columns={columns}
      lang={lang}
    />
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Avocado />
          <span className={styles.brandText}>
            <span className={styles.brandName}>Fathom</span>
            <span className={styles.brandKicker}>{t(lang, 'brand.kicker')}</span>
          </span>
        </div>

        <div className={styles.headerActions}>
          <Link href="/connect" className={styles.settingsLink}>
            {t(lang, 'nav.connect')}
          </Link>
          <Link href="/people" className={styles.settingsLink}>
            {t(lang, 'nav.people')}
          </Link>
          <Link href="/records" className={styles.settingsLink}>
            {t(lang, 'nav.records')}
          </Link>
          <Link href="/settings" className={styles.settingsLink}>
            {t(lang, 'nav.settings')}
          </Link>
          <SignOut email={user?.email} />
          <LangSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.pageHeadRow}>
          <div className={styles.pageHead}>
            <span className={styles.count}>
              {t(lang, 'home.count', { shown: meetings.length, total: all.length })}
            </span>
          </div>

          {all.length > 0 && <Stats {...stats} lang={lang} />}
        </div>

        <div className={styles.layout}>
          {/* sorting sits beside the meetings, on the left */}
          <aside className={styles.sidebar}>
            {all.length > 0 && <TypesBar types={stats.types} lang={lang} />}
            <Slot slots={slots} facetsBySlot={facetsBySlot} groups={groupTags} />
          </aside>

          <div className={styles.content}>
            {all.length === 0 ? (
              <EmptyState lang={lang} />
            ) : meetings.length === 0 ? (
              <NoResults lang={lang} />
            ) : (
              <>
                <div className={styles.tableTools}>
                  <SearchBox />
                  <NamelessFilter count={namelessCount} />
                  <ColumnManager />
                </div>

                <div className={styles.tableScroll}>
                  <div className={styles.table} style={gridStyle}>
                    <div
                      className={styles.tableHead}
                      style={gutterPad ? { paddingLeft: 20 + gutterPad } : undefined}
                    >
                      <SortableHeader facetsByTag={facetsByTag} columnFilters={columnFilters} />
                      {columns.map((column) => (
                        <span key={column.id}>
                          <ColumnHeader column={column} />
                        </span>
                      ))}
                    </div>

                    {flat ? (
                      <Outline meta={outlineMeta}>{flat.map((entry) => row(entry.meeting))}</Outline>
                    ) : (
                      meetings.map(row)
                    )}
                  </div>
                </div>

                <div className={styles.cards}>
                  {flat ? flat.map((entry) => card(entry.meeting)) : meetings.map(card)}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

//one meeting as a row of the grid
function MeetingRow({ meeting, participants, longest, columns, lang }) {
  const minutes = meeting.duration_minutes;
  const barWidth =
    longest > 0 && minutes ? Math.max(4, Math.round((minutes / longest) * 100)) : 0;
  const fields = meeting.custom_fields ?? {};
  const source = meetingTitleSource(meeting);
  const unnamed = NEEDS_NAME.has(source);
  const summary = meetingSummary(meeting);

  return (
    <div className={styles.row} data-unnamed={unnamed || undefined}>
      <span className={styles.date}>
        {formatDayMonth(meeting.date, lang)}
        <span className={styles.time}>{formatTime(meeting.start_time ?? meeting.date, lang)}</span>
      </span>

      <span className={styles.titleCell}>
        <EditableTitle
          meetingId={meeting.id}
          value={meetingTitle(meeting, lang)}
          source={source}
          href={`/meetings/${meeting.id}`}
          variant="row"
        />
        {summary && <span className={styles.rowSummary}>{summary}</span>}
      </span>

      <TypePicker meetingId={meeting.id} value={meetingTypes(meeting)} variant="compact" />

      <span className={styles.duration}>
        <span className={styles.durationTrack}>
          <span className={styles.durationFill} style={{ width: `${barWidth}%` }} />
        </span>
        <span className={styles.durationValue}>{formatDuration(minutes, lang)}</span>
      </span>

      <AvatarStack participants={participants} lang={lang} />

      <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />

      {columns.map((column) => (
        <CustomCell
          key={column.id}
          meetingId={meeting.id}
          column={column}
          value={fields[column.id]}
        />
      ))}
    </div>
  );
}

//the same meeting on a narrow screen
function MeetingCard({ meeting, participants, columns, lang }) {
  const fields = meeting.custom_fields ?? {};
  const filled = columns.filter((column) => {
    const value = fields[column.id];
    return value !== undefined && value !== null && value !== '';
  });

  return (
    <div className={styles.card}>
      <Link href={`/meetings/${meeting.id}`} className={styles.cardBody}>
        <span className={styles.cardTitle}>{meetingTitle(meeting, lang)}</span>

        <span className={styles.cardMeta}>
          {formatDayMonth(meeting.date, lang)}
          <span className={styles.cardSep}>·</span>
          {formatDuration(meeting.duration_minutes, lang)}
          <span className={styles.cardSep}>·</span>
          {t(lang, 'row.people', { n: participants.length })}
        </span>

        {participants.length > 0 && (
          <span className={styles.cardPeople}>
            {participants.map((person) => person.name || person.email).join(', ')}
          </span>
        )}

        {filled.length > 0 && (
          <span className={styles.cardFields}>
            {filled.map((column) => (
              <span key={column.id} className={styles.cardField}>
                {column.name}:{' '}
                {fields[column.id] === true
                  ? '✓'
                  : Array.isArray(fields[column.id])
                    ? fields[column.id].join(', ')
                    : String(fields[column.id])}
              </span>
            ))}
          </span>
        )}
      </Link>

      <div className={styles.cardSide}>
        {/* stars and types sit outside the link: a button inside <a> is invalid */}
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
        <TypePicker meetingId={meeting.id} value={meetingTypes(meeting)} variant="compact" />
      </div>
    </div>
  );
}

//participants written out by name, a few per row with a "+N" tail
function AvatarStack({ participants, lang }) {
  if (participants.length === 0) {
    return <span className={styles.dash}>—</span>;
  }

  const shown = participants.slice(0, VISIBLE_AVATARS);
  const hidden = participants.length - shown.length;
  const names = participants.map((person) => person.name || person.email).join(', ');

  return (
    <span className={styles.people} title={names}>
      {shown.map((person) => (
        <span key={person.id} className={styles.personName}>
          {person.name || person.email}
        </span>
      ))}
      {hidden > 0 && <span className={styles.morePeople}>{t(lang, 'row.more', { n: hidden })}</span>}
    </span>
  );
}

//nothing connected yet — walk a new person through the two setup steps
function EmptyState({ lang }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark} />
      <h2 className={styles.emptyTitle}>{t(lang, 'empty.title')}</h2>
      <p className={styles.emptyText}>{t(lang, 'empty.text')}</p>

      <ol className={styles.onboard}>
        <li className={styles.onboardStep}>
          <span className={styles.onboardNum}>1</span>
          <span className={styles.onboardBody}>
            <b>{t(lang, 'empty.step1Strong')}</b>
            {t(lang, 'empty.step1Text')}
            <Link href="/settings" className={styles.onboardLink}>
              {t(lang, 'empty.step1Link')}
            </Link>
          </span>
        </li>
        <li className={styles.onboardStep}>
          <span className={styles.onboardNum}>2</span>
          <span className={styles.onboardBody}>
            <b>{t(lang, 'empty.step2Strong')}</b>
            {t(lang, 'empty.step2Text')}
            <Link href="/connect" className={styles.onboardLink}>
              {t(lang, 'empty.step2Link')}
            </Link>
          </span>
        </li>
      </ol>
    </div>
  );
}

//the filter hid everything
function NoResults({ lang }) {
  return (
    <div className={styles.noResults}>
      <p className={styles.noResultsTitle}>{t(lang, 'noResults.title')}</p>
      <p className={styles.noResultsHint}>{t(lang, 'noResults.hint')}</p>
      <Link href="/" className={styles.noResultsReset}>
        {t(lang, 'noResults.reset')}
      </Link>
    </div>
  );
}
