import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { groupPeople, findPerson } from '@/lib/people';
import { formatDate, formatDuration, meetingTitle, meetingTitleSource } from '@/lib/format';
import { createClientForServer } from '@/lib/supabase-auth';
import { getLang } from '@/lib/i18n/server';
import styles from '../people.module.css';

export const dynamic = 'force-dynamic';

//one person: every meeting they took part in, across all their identities.
export default async function PersonPage({ params }) {
  const lang = await getLang();
  const { key } = await params;
  const decoded = decodeURIComponent(key);

  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { meetings, participantsByMeeting } = await getMeetings({ ownerEmail: user?.email });
  const people = groupPeople(meetings, participantsByMeeting);
  const person = findPerson(people, decoded);
  if (!person) notFound();

  const ids = new Set(person.meetingIds);
  const theirs = meetings
    .filter((m) => ids.has(m.id))
    .sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));

  return (
    <main className={styles.page}>
      <Link href="/people" className={styles.back}>
        ← people
      </Link>

      <div className={styles.head}>
        <h1 className={styles.title}>{person.label}</h1>
        <span className={styles.count}>{person.count}</span>
      </div>

      {/* every identity this person is recorded under, so nothing looks hidden */}
      <div className={styles.identities}>
        {person.emails.map((e) => (
          <span key={e} className={styles.chip}>{e}</span>
        ))}
        {person.aliases
          .filter((a) => a.toLowerCase() !== person.label.toLowerCase())
          .map((a) => (
            <span key={a} className={styles.chipName}>{a}</span>
          ))}
      </div>

      <ul className={styles.mlist}>
        {theirs.map((m) => (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`} className={styles.mrow}>
              <span className={styles.mtitle}>
                {meetingTitle(m, lang)}
                {meetingTitleSource(m) === 'ai_title' && <span className={styles.bot}> 🤖</span>}
              </span>
              <span className={styles.mmeta}>
                {formatDate(m.date, lang)}
                <span className={styles.msep}>·</span>
                {formatDuration(m.duration_minutes, lang)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
