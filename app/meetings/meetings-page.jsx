import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMeeting } from '@/lib/queries';
import { typeLabel, formatDate, formatTimeRange, formatDuration } from '@/lib/format';
import styles from './meeting.module.css';

export const dynamic = 'force-dynamic';

const TYPE_CLASS = {
  internal_planning: styles.typeInternal,
  client_meeting: styles.typeClient,
  automation: styles.typeAutomation,
  onboarding: styles.typeOnboarding,
  other: styles.typeOther,
};

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default async function MeetingPage({ params }) {
  const { id } = await params;
  const result = await getMeeting(id);

  if (!result) notFound();

  const { meeting, participants } = result;
  const topics = meeting.key_topics ?? [];
  const tasks = meeting.action_items ?? [];
  const timeRange = formatTimeRange(meeting.start_time, meeting.end_time);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={styles.backIcon}
        >
          <path
            d="M10 12L6 8l4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        All meetings
      </Link>

      <h1 className={styles.title}>{meeting.title ?? 'Untitled'}</h1>

      <div className={styles.meta}>
        <span className={styles.metaItem}>{formatDate(meeting.date)}</span>

        {timeRange && (
          <>
            <span className={styles.sep}>/</span>
            <span className={styles.metaItem}>{timeRange}</span>
          </>
        )}

        <span className={styles.sep}>/</span>
        <span className={styles.metaItem}>{formatDuration(meeting.duration_minutes)}</span>

        {meeting.meeting_type && (
          <span
            className={`${styles.badge} ${TYPE_CLASS[meeting.meeting_type] ?? styles.typeOther}`}
          >
            {typeLabel(meeting.meeting_type)}
          </span>
        )}

        {meeting.recording_url && (
          <a
            href={meeting.recording_url}
            target="_blank"
            rel="noreferrer"
            className={styles.fathomLink}
          >
            Open recording
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path
                d="M3 8L8 3M8 3H5M8 3v3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
      </div>

      {meeting.analysis_status === 'pending' && (
        <div className={`${styles.notice} ${styles.noticePending}`}>
          <p className={styles.noticeTitle}>Not analyzed yet</p>
          <p className={styles.noticeText}>
            This meeting is waiting in the queue. The transcript and participants below
            are already available.
          </p>
        </div>
      )}

      {meeting.analysis_status === 'failed' && (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <p className={styles.noticeTitle}>Analysis failed</p>
          <p className={styles.noticeText}>{meeting.analysis_error}</p>
        </div>
      )}

      {meeting.summary && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Summary</h2>
          <p className={styles.summary}>{meeting.summary}</p>
        </section>
      )}

      {topics.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Key topics</h2>
          <ul className={styles.topics}>
            {topics.map((t) => (
              <li key={t} className={styles.topic}>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Action items</h2>
          <ul className={styles.tasks}>
            {tasks.map((a, i) => (
              <li key={i} className={styles.task}>
                <span className={styles.taskIndex}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={styles.personText}>
                  <p className={styles.taskText}>{a.task}</p>
                  {a.assignee && <p className={styles.taskAssignee}>{a.assignee}</p>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {participants.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Participants ({participants.length})</h2>
          <ul className={styles.people}>
            {participants.map((p) => (
              <li key={p.id} className={styles.person}>
                <span className={styles.avatar}>{initials(p.name || p.email)}</span>
                <span className={styles.personText}>
                  <p className={styles.personName}>{p.name || p.email}</p>
                  {p.name && p.email && <p className={styles.personEmail}>{p.email}</p>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}