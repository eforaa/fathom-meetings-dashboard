import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { cookies } from 'next/headers';
import { getMeeting, getMeetings } from '@/lib/queries';
import { createClientForServer } from '@/lib/supabase-auth';
import {
  formatDate,
  formatDayMonth,
  formatTimeRange,
  formatDuration,
  initials,
  meetingTypes,
  meetingTitle,
  meetingTitleSource,
  meetingOriginalTitle,
  meetingSummary,
} from '@/lib/format';
import Stars from '../../stars';
import TypePicker from '../../type-picker';
import TitleControl from '../../title-control';
import EditableSummary from '../../editable-summary';
import MeetingActions from './meeting-actions';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import styles from './meeting.module.css';

export const dynamic = 'force-dynamic';

//meeting id is taken from url
export default async function MeetingPage({ params }) {
  const lang = await getLang();
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

  const timeRange = formatTimeRange(meeting.start_time, meeting.end_time, lang);

  //other meetings of the same recurring series (same displayed name)
  const seriesName = meetingTitle(meeting, lang);
  const { meetings: ownerMeetings } = await getMeetings({ ownerEmail: user?.email });
  const related =
    seriesName && seriesName !== 'No name'
      ? ownerMeetings
          .filter((m) => m.id !== meeting.id && meetingTitle(m, lang) === seriesName)
          .sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0))
          .slice(0, 8)
      : [];

  //a plain task list for the copy/export digest (ours first, else Fathom's)
  const exportTasks = tasks.length
    ? tasks.map((t) => ({ text: t.task, who: t.assignee || null }))
    : fathomTasks.map((t) => ({ text: t.description, who: t.assignee?.name || null }));

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← archive
      </Link>

      <div className={styles.titleRow}>
        <div className={styles.editorWrap}>
          <TitleControl
            meetingId={meeting.id}
            shown={meetingTitle(meeting, lang)}
            source={meetingTitleSource(meeting)}
            original={meetingOriginalTitle(meeting)}
            aiTitle={meeting.ai_title}
            customTitle={meeting.custom_title}
          />
        </div>
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
      </div>

      <div className={styles.typeRow}>
        <TypePicker meetingId={meeting.id} value={meetingTypes(meeting)} />
      </div>

      <div className={styles.facts}>
        <span>{formatDate(meeting.date, lang)}</span>
        {timeRange && (
          <>
            <span className={styles.factSep}>·</span>
            <span>{timeRange}</span>
          </>
        )}
        <span className={styles.factSep}>·</span>
        <span>{formatDuration(meeting.duration_minutes, lang)}</span>
        <span className={styles.factSep}>·</span>
        <span>{participants.length} people</span>

        {meeting.recording_url && (
          <a
            href={meeting.recording_url}
            target="_blank"
            rel="noreferrer"
            className={styles.recordingLink}
          >
            {t(lang, 'meeting.openInFathom')}
          </a>
        )}
      </div>

      <MeetingActions
        title={seriesName}
        date={formatDate(meeting.date, lang)}
        summary={meetingSummary(meeting) || meeting.fathom_summary || ''}
        topics={topics}
        tasks={exportTasks}
      />

      <div className={styles.columns}>
        <div className={styles.main}>
          {/* the meeting's own summary — hand-edited wins over the ai one */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t(lang, 'meeting.summary')}</h2>
            <EditableSummary meetingId={meeting.id} value={meetingSummary(meeting)} />
          </section>

          {/* fathom writes its own notes for every meeting, shown as they are */}
          {meeting.fathom_summary && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t(lang, 'meeting.fathomNotes')}</h2>
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
              <h2 className={styles.sectionTitle}>{t(lang, 'meeting.keyTopics')}</h2>
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
              <h2 className={styles.sectionTitle}>{t(lang, 'meeting.actionItems')}</h2>
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
              <h2 className={styles.sectionTitle}>{t(lang, 'meeting.actionItems')}</h2>
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

        {(participants.length > 0 || related.length > 0) && (
          <aside className={styles.aside}>
            {participants.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>{t(lang, 'meeting.people')}</h2>
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
              </>
            )}

            {/* other meetings of the same recurring series — see the dynamics */}
            {related.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>Серия · {related.length + 1}</h2>
                <ul className={styles.series}>
                  {related.map((m) => (
                    <li key={m.id}>
                      <Link href={`/meetings/${m.id}`} className={styles.seriesRow}>
                        <span className={styles.seriesDate}>{formatDayMonth(m.date, lang)}</span>
                        <span className={styles.seriesDur}>
                          {formatDuration(m.duration_minutes, lang)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
