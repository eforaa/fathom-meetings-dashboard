import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { typeLabel, formatDate, formatDuration, initials, meetingTypes } from '@/lib/format';
import { applySlots, collectFacets, readView, groupMeetings } from '@/lib/tags';
import { createClientForServer } from '@/lib/supabase-auth';
import { TableGroup, CardGroup } from './grouped';
import Stars from './stars';
import Slot from './slot';
import SignOut from './signout';
import ThemeToggle from './toggle';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const COLUMNS = ['Meeting', 'Type', 'Duration', 'People', 'Date', 'Priority'];

const TYPE_CLASS = {
  internal_planning: styles.typeInternal,
  client_meeting: styles.typeClient,
  automation: styles.typeAutomation,
  onboarding: styles.typeOnboarding,
  other: styles.typeOther,
};

const VISIBLE_AVATARS = 3;
const VISIBLE_TOPICS = 4;

//main meeting page
//reading the slot from the url, loading meetings, applying the slot
export default async function MeetingsPage({ searchParams }) {
  const sp = await searchParams;
  const { slots, group } = readView(sp);

  //who is signed in
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  //all meetings of this person, the slot is applied after
  const { meetings: all, participantsByMeeting } = await getMeetings({
    ownerEmail: user?.email,
  });

  //values for the filter dropdowns are collected before filtering,
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

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.title}>Meetings</h1>
            <p className={styles.subtitle}>Searchable archive of recorded calls</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.count}>{meetings.length} shown</span>
            <Link href="/settings" className={styles.settingsLink}>
              Settings
            </Link>
            <SignOut email={user?.email} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className={styles.slotBar}>
        <Slot slots={slots} facetsBySlot={facetsBySlot} group={group} />
      </div>

      <main className={styles.body}>
        {meetings.length === 0 ? (
          <EmptyState hasMeetings={all.length > 0} />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {groups
                    ? groups.map((group) => (
                        <TableGroup
                          key={group.label}
                          label={group.label}
                          count={group.items.length}
                          colSpan={COLUMNS.length}
                        >
                          {group.items.map((meeting) => (
                            <MeetingRow
                              key={meeting.id}
                              meeting={meeting}
                              participants={participantsByMeeting.get(meeting.id) ?? []}
                              longest={longest}
                            />
                          ))}
                        </TableGroup>
                      ))
                    : meetings.map((meeting) => (
                        <MeetingRow
                          key={meeting.id}
                          meeting={meeting}
                          participants={participantsByMeeting.get(meeting.id) ?? []}
                          longest={longest}
                        />
                      ))}
                </tbody>
              </table>
            </div>

            <ul className={styles.cards}>
              {groups
                ? groups.map((group) => (
                    <CardGroup
                      key={group.label}
                      label={group.label}
                      count={group.items.length}
                    >
                      {group.items.map((meeting) => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          participants={participantsByMeeting.get(meeting.id) ?? []}
                        />
                      ))}
                    </CardGroup>
                  ))
                : meetings.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      participants={participantsByMeeting.get(meeting.id) ?? []}
                    />
                  ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

//displaying one meeting inside the table
function MeetingRow({ meeting, participants, longest }) {
  const topics = meeting.key_topics ?? [];

  const minutes = meeting.duration_minutes;
  const barWidth =
    longest > 0 && minutes ? Math.max(4, Math.round((minutes / longest) * 100)) : 0;

  return (
    <tr className={styles.row}>
      <td className={styles.meetingCell}>
        <Link href={`/meetings/${meeting.id}`} className={styles.link}>
          {/* ai_title is empty until the meeting is analyzed;
              the fathom purpose line is a better fallback than a raw zoom title */}
          {meeting.ai_title || meeting.fathom_title || meeting.title || 'Untitled'}
          <ArrowIcon />
        </Link>

        {topics.length > 0 && (
          <p className={styles.topicLine}>
            {topics.slice(0, VISIBLE_TOPICS).join(' · ')}
          </p>
        )}
      </td>

      <td>
        <span className={styles.typeCell}>
          {meetingTypes(meeting).map((type) => (
            <TypeChip key={type} type={type} />
          ))}
        </span>
      </td>

      <td>
        <span className={styles.duration}>
          <span className={styles.durationValue}>{formatDuration(minutes)}</span>
          <span className={styles.durationTrack}>
            <span className={styles.durationFill} style={{ width: `${barWidth}%` }} />
          </span>
        </span>
      </td>

      <td>
        <AvatarStack participants={participants} />
      </td>

      <td className={styles.dateCell}>{formatDate(meeting.date)}</td>

      <td>
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
      </td>
    </tr>
  );
}

//mobile meeting card
function MeetingCard({ meeting, participants }) {
  const topics = meeting.key_topics ?? [];
  const types = meetingTypes(meeting);

  return (
    <li className={styles.cardOuter}>
      <Link href={`/meetings/${meeting.id}`} className={styles.card}>
        {types.length > 0 && (
          <div className={styles.cardTop}>
            {types.map((type) => (
              <TypeChip key={type} type={type} />
            ))}
          </div>
        )}

        <p className={styles.cardTitle}>
          {meeting.ai_title || meeting.fathom_title || meeting.title || 'Untitled'}
        </p>

        {topics.length > 0 && (
          <p className={styles.cardTopics}>
            {topics.slice(0, VISIBLE_TOPICS).join(' · ')}
          </p>
        )}

        <div className={styles.cardBottom}>
          <AvatarStack participants={participants} />

          <span className={styles.cardMeta}>
            {formatDuration(meeting.duration_minutes)}
            <span className={styles.cardMetaSep}>·</span>
            {formatDate(meeting.date)}
          </span>
        </div>
      </Link>

      {/* stars sit outside the link: a button inside <a> is invalid markup */}
      <span className={styles.cardStars}>
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
      </span>
    </li>
  );
}

//displays meeting type with color
function TypeChip({ type }) {
  return (
    <span className={`${styles.chip} ${TYPE_CLASS[type] ?? styles.typeOther}`}>
      <span className={styles.chipDot} />
      {typeLabel(type)}
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
      {hidden > 0 && (
        <span className={`${styles.avatar} ${styles.avatarMore}`}>+{hidden}</span>
      )}
    </span>
  );
}

//message when no meetings is found
//two different reasons: nothing connected yet, or the filter hid everything
function EmptyState({ hasMeetings }) {
  if (!hasMeetings) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No meetings yet</p>
        <p className={styles.emptyHint}>
          Connect your Fathom key in{' '}
          <Link href="/settings" className={styles.emptyLink}>
            settings
          </Link>{' '}
          to pull your own calls.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>Nothing matches this filter</p>
      <p className={styles.emptyHint}>
        Try another value, or{' '}
        <Link href="/" className={styles.emptyLink}>
          reset the slot
        </Link>
        .
      </p>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={styles.arrow}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}