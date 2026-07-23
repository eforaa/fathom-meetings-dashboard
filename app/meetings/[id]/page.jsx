import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { cookies } from 'next/headers';
import { getMeeting } from '@/lib/queries';
import { createClientForServer } from '@/lib/supabase-auth';
import {
  formatDate,
  formatTimeRange,
  formatDuration,
  initials,
  meetingTypes,
} from '@/lib/format';
import Stars from '../../stars';
import TypePicker from '../../type-picker';
import styles from './meeting.module.css';

export const dynamic = 'force-dynamic';

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

  const timeRange = formatTimeRange(meeting.start_time, meeting.end_time);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← archive
      </Link>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>
          {meeting.ai_title || meeting.fathom_title || meeting.title || 'Untitled'}
        </h1>
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
      </div>

      {/* show the raw recording title when a nicer title took its place */}
      {(meeting.ai_title || meeting.fathom_title) && meeting.title && (
        <p className={styles.originalTitle}>Recorded as “{meeting.title}”</p>
      )}

      <div className={styles.typeRow}>
        <TypePicker meetingId={meeting.id} value={meetingTypes(meeting)} />
      </div>

      <div className={styles.facts}>
        <span>{formatDate(meeting.date)}</span>
        {timeRange && (
          <>
            <span className={styles.factSep}>·</span>
            <span>{timeRange}</span>
          </>
        )}
        <span className={styles.factSep}>·</span>
        <span>{formatDuration(meeting.duration_minutes)}</span>
        <span className={styles.factSep}>·</span>
        <span>{participants.length} people</span>

        {meeting.recording_url && (
          <a
            href={meeting.recording_url}
            target="_blank"
            rel="noreferrer"
            className={styles.recordingLink}
          >
            open in Fathom ↗
          </a>
        )}
      </div>

      <div className={styles.columns}>
        <div className={styles.main}>
          {meeting.summary && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Summary</h2>
              <p className={styles.summary}>{meeting.summary}</p>
            </section>
          )}

          {/* fathom writes its own notes for every meeting, shown as they are */}
          {meeting.fathom_summary && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Notes</h2>
              <div className={styles.notes}>
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
                    <span className={styles.taskBox} />
                    <span className={styles.taskText}>{task.task}</span>
                    {task.assignee && (
                      <span className={styles.taskWho} title={task.assignee}>
                        {initials(task.assignee)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* fathom's action items step in while our own analysis is not there yet */}
          {tasks.length === 0 && fathomTasks.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Action items</h2>
              <ul className={styles.tasks}>
                {fathomTasks.map((task, index) => (
                  <li key={index} className={styles.task}>
                    <span className={styles.taskBox} />
                    <span className={styles.taskText}>{task.description}</span>

                    {task.recording_playback_url && (
                      <a
                        href={task.recording_playback_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.taskTime}
                      >
                        {task.recording_timestamp ?? 'open'}
                      </a>
                    )}

                    {task.assignee?.name && (
                      <span className={styles.taskWho} title={task.assignee.name}>
                        {initials(task.assignee.name)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {participants.length > 0 && (
          <aside className={styles.aside}>
            <h2 className={styles.sectionTitle}>People</h2>
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
                    {person.email_domain && (
                      <span className={styles.personRole}>{person.email_domain}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </main>
  );
}
