import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { formatDate, meetingTitle, meetingTitleSource } from '@/lib/format';
import { createClientForServer } from '@/lib/supabase-auth';
import RecordsTable from './records-table';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import LangSwitch from '../lang-switch';
import styles from './records.module.css';

export const dynamic = 'force-dynamic';

//a read-only look at the raw database records behind the dashboard.
//the main table shows ONE computed title per meeting; here every underlying
//field is laid out side by side so a person can verify what is really stored
//and see the naming rule working, without a Supabase account.
export default async function RecordsPage() {
  const lang = await getLang();
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { meetings } = await getMeetings({ ownerEmail: user?.email });

  //only the raw fields that matter for the "which name is shown, and why"
  //question, plus the computed result and its source field
  const rows = meetings.map((meeting) => ({
    id: meeting.id,
    date: meeting.date ? formatDate(meeting.date, lang) : '—',
    shown: meetingTitle(meeting, lang),
    source: meetingTitleSource(meeting),
    title: meeting.title ?? '',
    custom_title: meeting.custom_title ?? '',
    ai_title: meeting.ai_title ?? '',
    fathom_title: meeting.fathom_title ?? '',
  }));

  return (
    <main className={styles.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Link href="/" className={styles.back}>
        ← dashboard
      </Link>
        <LangSwitch />
      </div>

      <h1 className={styles.title}>{t(lang, 'records.title')}</h1>
      <p className={styles.lede}>
        {t(lang, 'records.lede')}
      </p>

      <div className={styles.rule}>
        <span className={styles.ruleLabel}>{t(lang, 'records.ruleLabel')}</span>
        <code className={styles.ruleCode}>
          custom_title → ai_title → title (настоящее имя) → fathom_title → «No name»
        </code>
        <p className={styles.ruleNote}>
          {t(lang, 'records.ruleNote')}
        </p>
      </div>

      <RecordsTable rows={rows} lang={lang} />
    </main>
  );
}
