import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { groupPeople } from '@/lib/people';
import { initials } from '@/lib/format';
import { createClientForServer } from '@/lib/supabase-auth';
import styles from './people.module.css';

export const dynamic = 'force-dynamic';

//everyone who ever appears in this owner's meetings, merged across their
//different names/emails, each linking to all of that person's meetings.
export default async function PeoplePage() {
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { meetings, participantsByMeeting } = await getMeetings({ ownerEmail: user?.email });
  const people = groupPeople(meetings, participantsByMeeting);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← dashboard
      </Link>

      <div className={styles.head}>
        <h1 className={styles.title}>People</h1>
        <span className={styles.count}>{people.length}</span>
      </div>
      <p className={styles.lede}>
        Все участники ваших встреч. Разные имена и почты одного человека объединены —
        нажмите, чтобы увидеть все его встречи сразу.
      </p>

      {people.length === 0 ? (
        <p className={styles.empty}>Пока никого нет.</p>
      ) : (
        <ul className={styles.list}>
          {people.map((person) => (
            <li key={person.key}>
              <Link href={`/people/${encodeURIComponent(person.key)}`} className={styles.row}>
                <span className={styles.avatar}>{initials(person.label)}</span>
                <span className={styles.body}>
                  <span className={styles.name}>{person.label}</span>
                  <span className={styles.sub}>
                    {person.emails[0] ?? 'без почты'}
                    {person.aliases.length + person.emails.length > 1 && (
                      <span className={styles.aliasTag}>
                        +{person.aliases.length + person.emails.length - 1} алиас(ов)
                      </span>
                    )}
                  </span>
                </span>
                <span className={styles.meetings}>{person.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
