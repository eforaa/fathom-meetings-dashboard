import Link from 'next/link';
import { getMeetings, getAllParticipants } from '@/lib/queries';
import { typeLabel, formatDate, formatDuration, initials } from '@/lib/format';
import Filters from './filters';
import ThemeToggle from './toggle';
import styles from './page.module.css';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import SignOut from './signout';

export const dynamic = 'force-dynamic';

const COLUMNS = ['Meeting', 'Type', 'Duration', 'People', 'Date', 'Status'];

const TYPE_CLASS = {
  internal_planning: styles.typeInternal,
  client_meeting: styles.typeClient,
  automation: styles.typeAutomation,
  onboarding: styles.typeOnboarding,
  other: styles.typeOther,
};

const STATUS = {
  done: { label: 'analyzed', className: styles.statusDone },
  pending: { label: 'queued', className: styles.statusPending },
  failed: { label: 'failed', className: styles.statusError },
};

const VISIBLE_AVATARS = 3;
const VISIBLE_TOPICS = 4;

//converting query into an array
//empty value return empty array
//if it is already array - return
//split values with comma
function parseList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(',').filter(Boolean);
}

//reading filters from the url
//default sorting by date
function readFilters(searchParams) {
  return {
    types: parseList(searchParams.type),
    participants: parseList(searchParams.person),
    sort: searchParams.sort === 'duration' ? 'duration' : 'date',
    dir: searchParams.dir === 'asc' ? 'asc' : 'desc',
  };
}

//main meeting page
//reading current filters
//load meetings and participants 
export default async function MeetingsPage({ searchParams }) {
  const filters = readFilters(await searchParams);

  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ meetings, participantsByMeeting }, people] = await Promise.all([
    getMeetings({ ...filters, ownerEmail: user?.email }),
    getAllParticipants(user?.email),
  ]);


  const longest = meetings.reduce(
    (max, meeting) => Math.max(max, meeting.duration_minutes ?? 0),
    0,
  );

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

      <Filters people={people} />

      <main className={styles.body}>
        {meetings.length === 0 ? (
          <EmptyState />
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
                  {meetings.map((meeting) => (
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
              {meetings.map((meeting) => (
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
  const status = STATUS[meeting.analysis_status] ?? STATUS.done;

  const minutes = meeting.duration_minutes;
  const barWidth =
    longest > 0 && minutes ? Math.max(4, Math.round((minutes / longest) * 100)) : 0;

  return (
    <tr className={styles.row}>
      <td className={styles.meetingCell}>
        <Link href={`/meetings/${meeting.id}`} className={styles.link}>
          {/* ai_title is empty until the meeting is analyzed, so the
              original Fathom title stays as the fallback. */}
          {meeting.ai_title || meeting.title || 'Untitled'}
          <ArrowIcon />
        </Link>

        {topics.length > 0 && (
          <p className={styles.topicLine}>
            {topics.slice(0, VISIBLE_TOPICS).join(' · ')}
          </p>
        )}
      </td>

      <td>
        {meeting.meeting_type && (
          <TypeChip type={meeting.meeting_type} />
        )}
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
        <span className={`${styles.status} ${status.className}`}>
          <span className={styles.statusDot} />
          {status.label}
        </span>
      </td>
    </tr>
  );
}
//mobile meeting card
function MeetingCard({ meeting, participants }) {
  const topics = meeting.key_topics ?? [];
  const status = STATUS[meeting.analysis_status] ?? STATUS.done;

  return (
    <li>
      <Link href={`/meetings/${meeting.id}`} className={styles.card}>
        <div className={styles.cardTop}>
          {meeting.meeting_type ? (
            <TypeChip type={meeting.meeting_type} />
          ) : (
            <span />
          )}

          <span className={`${styles.status} ${status.className}`}>
            <span className={styles.statusDot} />
            {status.label}
          </span>
        </div>

        <p className={styles.cardTitle}>
          {meeting.ai_title || meeting.title || 'Untitled'}
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
function EmptyState() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>No meetings match these filters</p>
      <p className={styles.emptyHint}>
        Try again, or{' '}
        <Link href="/" className={styles.emptyLink}>
          clear all filters
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