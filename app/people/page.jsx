import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { groupPeople } from '@/lib/people';
import { initials } from '@/lib/format';
import { createClientForServer } from '@/lib/supabase-auth';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import LangSwitch from '../lang-switch';
import styles from './people.module.css';

export const dynamic = 'force-dynamic';

//everyone who ever appears in this owner's meetings, merged across their
//different names/emails, each linking to all of that person's meetings.
export default async function PeoplePage() {
  const lang = await getLang();
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { meetings, participantsByMeeting } = await getMeetings({ ownerEmail: user?.email });
  const people = groupPeople(meetings, participantsByMeeting);

  return (
    <main className={styles.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Link href="/" className={styles.back}>
        ← dashboard
      </Link>
        <LangSwitch />
      </div>

      <div className={styles.head}>
        <h1 className={styles.title}>{t(lang, 'people.title')}</h1>
        <span className={styles.count}>{people.length}</span>
      </div>
      <p className={styles.lede}>
        {t(lang, 'people.lede')}
      </p>

      {people.length === 0 ? (
        <p className={styles.empty}>{t(lang, 'people.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {people.map((person) => (
            <li key={person.key}>
              <Link href={`/people/${encodeURIComponent(person.key)}`} className={styles.row}>
                <span className={styles.avatar}>{initials(person.label)}</span>
                <span className={styles.body}>
                  <span className={styles.name}>{person.label}</span>
                  <span className={styles.sub}>
                    {person.emails[0] ?? t(lang, 'people.noEmail')}
                    {person.aliases.length + person.emails.length > 1 && (
                      <span className={styles.aliasTag}>
                        {t(lang, 'people.aliases', { n: person.aliases.length + person.emails.length - 1 })}
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
