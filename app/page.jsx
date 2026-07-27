import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import {
  formatDayMonth,
  formatTime,
  formatDuration,
  meetingTypes,
  meetingTitle,
} from '@/lib/format';
import { applySlots, applyColumnFilters, collectFacets, readView, groupMeetings } from '@/lib/tags';
import { createClientForServer } from '@/lib/supabase-auth';
import { listColumns } from '@/lib/columns';
import Group from './grouped';
import Stars from './stars';
import EditableTitle from './editable-title';
import TypePicker from './type-picker';
import CustomCell from './custom-cell';
import ColumnManager, { ColumnHeader } from './column-manager';
import Slot from './slot';
import SignOut from './signout';
import ThemeToggle from './toggle';
import SortableHeader from './sortable-header';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

//the six built-in tracks; custom columns are appended after them
const BUILTIN_GRID = 'minmax(170px, 1.5fr) 84px 118px minmax(150px, 1fr) 100px 108px';

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
  const { slots, group } = readView(sp);

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
    slot.tag ? collectFacets(all, participantsByMeeting, slot.tag) : [],
  );

  //per-column filters from the table header (multi-value, AND across columns)
  const FILTERABLE = ['type', 'people', 'importance'];
  const columnFilters = Object.fromEntries(
    FILTERABLE.map((tag) => [tag, String(sp[`c_${tag}`] ?? '').split('~').filter(Boolean)]),
  );
  const facetsByTag = Object.fromEntries(
    FILTERABLE.map((tag) => [tag, collectFacets(all, participantsByMeeting, tag)]),
  );

  const filtered = applyColumnFilters(all, participantsByMeeting, columnFilters);
  const meetings = applySlots(filtered, participantsByMeeting, slots);

  //the longest meeting on screen sets the scale of the duration bars
  const longest = meetings.reduce(
    (max, meeting) => Math.max(max, meeting.duration_minutes ?? 0),
    0,
  );

  //groups are built on the already sorted list, so their order follows the sort
  const groups = group ? groupMeetings(meetings, participantsByMeeting, group) : null;

  //one row, rendered the same way inside a group and without one
  const row = (meeting) => (
    <MeetingRow
      key={meeting.id}
      meeting={meeting}
      participants={participantsByMeeting.get(meeting.id) ?? []}
      longest={longest}
      columns={columns}
    />
  );

  const card = (meeting) => (
    <MeetingCard
      key={meeting.id}
      meeting={meeting}
      participants={participantsByMeeting.get(meeting.id) ?? []}
      columns={columns}
    />
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandName}>Fathom</span>
          <span className={styles.brandKicker}>meetings&nbsp;explorer</span>
        </div>

        <div className={styles.headerActions}>
          <Link href="/records" className={styles.settingsLink}>
            Records
          </Link>
          <Link href="/settings" className={styles.settingsLink}>
            Settings
          </Link>
          <SignOut email={user?.email} />
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>My meetings</h1>
          <span className={styles.count}>
            {meetings.length} of {all.length}
          </span>
        </div>

        <div className={styles.layout}>
          {/* sorting sits beside the meetings, on the left */}
          <aside className={styles.sidebar}>
            <Slot slots={slots} facetsBySlot={facetsBySlot} group={group} />
          </aside>

          <div className={styles.content}>
            {all.length === 0 ? (
              <EmptyState />
            ) : meetings.length === 0 ? (
              <NoResults />
            ) : (
              <>
                <div className={styles.tableTools}>
                  <ColumnManager />
                </div>

                <div className={styles.tableScroll}>
                  <div className={styles.table} style={gridStyle}>
                    <div className={styles.tableHead}>
                      <SortableHeader facetsByTag={facetsByTag} columnFilters={columnFilters} />
                      {columns.map((column) => (
                        <span key={column.id}>
                          <ColumnHeader column={column} />
                        </span>
                      ))}
                    </div>

                    {groups
                      ? groups.map((section) => (
                          <Group
                            key={section.label}
                            label={section.label}
                            count={section.items.length}
                          >
                            {section.items.map(row)}
                          </Group>
                        ))
                      : meetings.map(row)}
                  </div>
                </div>

                <div className={styles.cards}>
                  {groups
                    ? groups.map((section) => (
                        <Group
                          key={section.label}
                          label={section.label}
                          count={section.items.length}
                        >
                          {section.items.map(card)}
                        </Group>
                      ))
                    : meetings.map(card)}
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
function MeetingRow({ meeting, participants, longest, columns }) {
  const minutes = meeting.duration_minutes;
  const barWidth =
    longest > 0 && minutes ? Math.max(4, Math.round((minutes / longest) * 100)) : 0;
  const fields = meeting.custom_fields ?? {};

  return (
    <div className={styles.row}>
      <EditableTitle
        meetingId={meeting.id}
        value={meetingTitle(meeting)}
        href={`/meetings/${meeting.id}`}
        variant="row"
      />

      <TypePicker meetingId={meeting.id} value={meetingTypes(meeting)} variant="compact" />

      <span className={styles.duration}>
        <span className={styles.durationTrack}>
          <span className={styles.durationFill} style={{ width: `${barWidth}%` }} />
        </span>
        <span className={styles.durationValue}>{formatDuration(minutes)}</span>
      </span>

      <AvatarStack participants={participants} />

      <span className={styles.date}>
        {formatDayMonth(meeting.date)}
        <span className={styles.time}>{formatTime(meeting.start_time ?? meeting.date)}</span>
      </span>

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
function MeetingCard({ meeting, participants, columns }) {
  const fields = meeting.custom_fields ?? {};
  const filled = columns.filter((column) => {
    const value = fields[column.id];
    return value !== undefined && value !== null && value !== '';
  });

  return (
    <div className={styles.card}>
      <Link href={`/meetings/${meeting.id}`} className={styles.cardBody}>
        <span className={styles.cardTitle}>{meetingTitle(meeting)}</span>

        <span className={styles.cardMeta}>
          {formatDayMonth(meeting.date)}
          <span className={styles.cardSep}>·</span>
          {formatDuration(meeting.duration_minutes)}
          <span className={styles.cardSep}>·</span>
          {participants.length} people
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
function AvatarStack({ participants }) {
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
      {hidden > 0 && <span className={styles.morePeople}>+{hidden} more</span>}
    </span>
  );
}

//nothing connected yet
function EmptyState() {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark} />
      <h2 className={styles.emptyTitle}>No meetings yet</h2>
      <p className={styles.emptyText}>
        Once you connect Fathom, your calls appear here on their own — with notes,
        action items and transcripts.
      </p>
      <Link href="/settings" className={styles.emptyAction}>
        Connect Fathom
      </Link>
    </div>
  );
}

//the filter hid everything
function NoResults() {
  return (
    <div className={styles.noResults}>
      <p className={styles.noResultsTitle}>Nothing found</p>
      <p className={styles.noResultsHint}>Loosen the filters in the panel above</p>
    </div>
  );
}
