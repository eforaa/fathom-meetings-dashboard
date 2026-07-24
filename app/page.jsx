import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import {
  typeLabel,
  formatDayMonth,
  formatTime,
  formatDuration,
  initials,
  meetingTypes,
  meetingTitle,
} from '@/lib/format';
import { applySlots, collectFacets, readView, groupMeetings } from '@/lib/tags';
import { createClientForServer } from '@/lib/supabase-auth';
import Group from './grouped';
import Stars from './stars';
import EditableTitle from './editable-title';
import Slot from './slot';
import SignOut from './signout';
import ThemeToggle from './toggle';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const COLUMNS = ['Meeting', 'Types', 'Duration', 'People', 'Date', 'Priority'];

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

  //values for the filter chips are collected before filtering,
  //otherwise choosing one value would hide all the others
  const facetsBySlot = slots.map((slot) =>
    slot.tag ? collectFacets(all, participantsByMeeting, slot.tag) : [],
  );

  const meetings = applySlots(all, participantsByMeeting, slots);

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
    />
  );

  const card = (meeting) => (
    <MeetingCard
      key={meeting.id}
      meeting={meeting}
      participants={participantsByMeeting.get(meeting.id) ?? []}
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

        <div className={styles.slotBar}>
          <Slot slots={slots} facetsBySlot={facetsBySlot} group={group} />
        </div>

        {all.length === 0 ? (
          <EmptyState />
        ) : meetings.length === 0 ? (
          <NoResults />
        ) : (
          <>
            <div className={styles.table}>
              <div className={styles.tableHead}>
                {COLUMNS.map((column) => (
                  <span key={column}>{column}</span>
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
      </main>
    </div>
  );
}

//one meeting as a row of the grid
function MeetingRow({ meeting, participants, longest }) {
  const minutes = meeting.duration_minutes;
  const barWidth =
    longest > 0 && minutes ? Math.max(4, Math.round((minutes / longest) * 100)) : 0;

  return (
    <div className={styles.row}>
      <EditableTitle
        meetingId={meeting.id}
        value={meetingTitle(meeting)}
        href={`/meetings/${meeting.id}`}
        variant="row"
      />

      <TypeDots meeting={meeting} />

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
    </div>
  );
}

//the same meeting on a narrow screen
function MeetingCard({ meeting, participants }) {
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
      </Link>

      <div className={styles.cardSide}>
        {/* stars sit outside the link: a button inside <a> is invalid markup */}
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
        <TypeDots meeting={meeting} />
      </div>
    </div>
  );
}

//types as small coloured dots, the full name shows on hover
function TypeDots({ meeting }) {
  const types = meetingTypes(meeting);

  return (
    <span className={styles.dots}>
      {types.map((type) => (
        <span
          key={type}
          title={typeLabel(type)}
          className={styles.dot}
          style={{ background: `var(--type-${type.split('_')[0]})` }}
        />
      ))}
    </span>
  );
}

//displays participants initials
function AvatarStack({ participants }) {
  if (participants.length === 0) {
    return <span className={styles.dash}>—</span>;
  }

  const shown = participants.slice(0, VISIBLE_AVATARS);
  const hidden = participants.length - shown.length;
  const names = participants.map((person) => person.name || person.email).join(', ');

  return (
    <span className={styles.avatars} title={names}>
      {shown.map((person) => (
        <span key={person.id} className={styles.avatar}>
          {initials(person.name || person.email)}
        </span>
      ))}
      {hidden > 0 && <span className={styles.avatarMore}>+{hidden}</span>}
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
