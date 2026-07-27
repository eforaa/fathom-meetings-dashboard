import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { formatDate, meetingTitle, meetingTitleSource } from '@/lib/format';
import { createClientForServer } from '@/lib/supabase-auth';
import RecordsTable from './records-table';
import styles from './records.module.css';

export const dynamic = 'force-dynamic';

//a read-only look at the raw database records behind the dashboard.
//the main table shows ONE computed title per meeting; here every underlying
//field is laid out side by side so a person can verify what is really stored
//and see the naming rule working, without a Supabase account.
export default async function RecordsPage() {
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { meetings } = await getMeetings({ ownerEmail: user?.email });

  //only the raw fields that matter for the "which name is shown, and why"
  //question, plus the computed result and its source field
  const rows = meetings.map((meeting) => ({
    id: meeting.id,
    date: meeting.date ? formatDate(meeting.date) : '—',
    shown: meetingTitle(meeting),
    source: meetingTitleSource(meeting),
    title: meeting.title ?? '',
    custom_title: meeting.custom_title ?? '',
    ai_title: meeting.ai_title ?? '',
    fathom_title: meeting.fathom_title ?? '',
  }));

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← dashboard
      </Link>

      <h1 className={styles.title}>Records</h1>
      <p className={styles.lede}>
        Сырые записи базы данных, как есть — только чтение. В обычной таблице виден
        один итоговый заголовок; здесь видно все поля, из которых он собирается,
        и по какому правилу.
      </p>

      <div className={styles.rule}>
        <span className={styles.ruleLabel}>Правило заголовка</span>
        <code className={styles.ruleCode}>
          custom_title → ai_title → title (настоящее имя) → fathom_title → «No name»
        </code>
        <p className={styles.ruleNote}>
          Подсвеченное поле — то, что реально показывается. <code>custom_title</code> —
          единственное поле, куда пишет Клод через коннектор.
        </p>
      </div>

      <RecordsTable rows={rows} />
    </main>
  );
}
