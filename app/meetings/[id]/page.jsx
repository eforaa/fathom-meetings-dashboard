import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
//formatting helpeer functions
import { getMeeting } from '@/lib/queries';
import {
  typeLabel,
  formatDate,
  formatTimeRange,
  formatDuration,
  initials,
} from '@/lib/format';
import styles from './meeting.module.css';
import { cookies } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';

export const dynamic = 'force-dynamic';
//creating css class for each type
const TYPE_CLASS = {
  internal_planning: styles.typeInternal,
  client_meeting: styles.typeClient,
  automation: styles.typeAutomation,
  onboarding: styles.typeOnboarding,
  other: styles.typeOther,
};

//meeting id is taken from url
export default async function MeetingPage({ params }) {
  const { id } = await params;

  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await getMeeting(id, user?.email);

  if (!result) notFound();
  //loading meetings from database
  const { meeting, participants } = result;
  //meetings topics
  const topics = meeting.key_topics ?? [];
  const tasks = meeting.action_items ?? [];
  //ready-made action items that came from fathom
  const fathomTasks = Array.isArray(meeting.fathom_action_items)
    ? meeting.fathom_action_items
    : [];

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        <BackIcon />
        All meetings
      </Link>

      <header className={styles.head}>
        {meeting.meeting_type && (
          <span
            className={`${styles.chip} ${TYPE_CLASS[meeting.meeting_type] ?? styles.typeOther}`}
          >
            <span className={styles.chipDot} />
            {typeLabel(meeting.meeting_type)}
          </span>
        )}

        <h1 className={styles.title}>
          {meeting.ai_title || meeting.fathom_title || meeting.title || 'Untitled'}
        </h1>

        {/* show the raw recording title when a nicer title took its place */}
        {(meeting.ai_title || meeting.fathom_title) && meeting.title && (
          <p className={styles.originalTitle}>Recorded as “{meeting.title}”</p>
        )}
      </header>

      <Facts meeting={meeting} participantCount={participants.length} />

      {meeting.recording_url && (
        <a
          href={meeting.recording_url}
          target="_blank"
          rel="noreferrer"
          className={styles.recordingLink}
        >
          Open recording in Fathom
          <ExternalIcon />
        </a>
      )}

      {/* Sections are hidden rather than shown empty: an unanalyzed meeting
          should not display four headings with nothing under them. */}
      {meeting.summary && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Summary</h2>
          <p className={styles.summary}>{meeting.summary}</p>
        </section>
      )}

      {/* fathom writes its own notes for every meeting, shown as they are */}
      {meeting.fathom_summary && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Meeting notes · Fathom</h2>
          <div className={styles.fathomNotes}>
            <ReactMarkdown
              components={{
                //timestamp links should open the recording in a new tab
                a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
              }}
            >
              {meeting.fathom_summary}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {topics.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Key topics</h2>
          <ul className={styles.topics}>
            {topics.map((topic) => (
              <li key={topic} className={styles.topic}>
                {topic}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Action items</h2>
          <ul className={styles.tasks}>
            {tasks.map((task, index) => (
              <li key={index} className={styles.task}>
                <span className={styles.taskIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.taskBody}>
                  <span className={styles.taskText}>{task.task}</span>
                  {task.assignee && (
                    <span className={styles.taskAssignee}>{task.assignee}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* fathom's action items step in while our own analysis is not there yet */}
      {tasks.length === 0 && fathomTasks.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Action items · Fathom</h2>
          <ul className={styles.tasks}>
            {fathomTasks.map((task, index) => (
              <li key={index} className={styles.task}>
                <span className={styles.taskIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.taskBody}>
                  <span className={styles.taskText}>{task.description}</span>
                  <span className={styles.taskMeta}>
                    {task.assignee?.name && (
                      <span className={styles.taskAssignee}>{task.assignee.name}</span>
                    )}
                    {task.recording_playback_url && (
                      <a
                        href={task.recording_playback_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.taskLink}
                      >
                        {task.recording_timestamp ?? 'open moment'}
                      </a>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {participants.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Participants</h2>
          <ul className={styles.people}>
            {participants.map((person) => (
              <li key={person.id} className={styles.person}>
                <span className={styles.avatar}>
                  {initials(person.name || person.email)}
                </span>
                <span className={styles.personBody}>
                  <span className={styles.personName}>
                    {person.name || person.email}
                  </span>
                  {person.name && person.email && (
                    <span className={styles.personEmail}>{person.email}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

//meeting information
function Facts({ meeting, participantCount }) {
  const timeRange = formatTimeRange(meeting.start_time, meeting.end_time);

  const facts = [
    { label: 'Date', value: formatDate(meeting.date) },
    timeRange && { label: 'Time', value: timeRange },
    { label: 'Duration', value: formatDuration(meeting.duration_minutes) },
    { label: 'People', value: String(participantCount) },
  ].filter(Boolean);

  return (
    <dl className={styles.facts}>
      {facts.map((fact) => (
        <div key={fact.label} className={styles.fact}>
          <dt className={styles.factLabel}>{fact.label}</dt>
          <dd className={styles.factValue}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BackIcon() {
  return (
    <svg
      width="13"
      height="13"
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
  );
}

function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path
        d="M3 8L8 3M8 3H5M8 3v3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}