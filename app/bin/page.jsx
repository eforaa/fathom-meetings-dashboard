import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings } from '@/lib/queries';
import { formatDate, formatTime, meetingTitle, meetingTypes, typeLabel } from '@/lib/format';
import { createClientForServer } from '@/lib/supabase-auth';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import LangSwitch from '../lang-switch';
import BinList from './bin-list';
import styles from './bin.module.css';

export const dynamic = 'force-dynamic';

//Корзина. В Fathom встречи не удаляются — их архивируют: archived = true.
//По решению корзина сделана поверх этого же поля: отдельный экран, где видно
//всё убранное в архив, и каждую строку можно вернуть. Восстановление идёт
//через тот же bulk-роут, что и у панели действий (set archived:false), —
//одно правило снятия архива на весь проект.
export default async function BinPage() {
    const lang = await getLang();
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { meetings } = await getMeetings({ ownerEmail: user?.email });
    const archived = meetings.filter((meeting) => meeting.archived);

    const rows = archived.map((meeting) => ({
        id: meeting.id,
        title: meetingTitle(meeting, lang),
        when: meeting.date ? `${formatDate(meeting.date, lang)} · ${formatTime(meeting.date, lang)}` : '',
        types: meetingTypes(meeting).map((key) => ({ key, label: typeLabel(key, lang) })),
    }));

    return (
        <main className={styles.page}>
            <div className={styles.top}>
                <Link href="/" className={styles.back}>
                    ← {t(lang, 'bin.back')}
                </Link>
                <LangSwitch />
            </div>

            <h1 className={styles.title}>{t(lang, 'bin.title')}</h1>
            <p className={styles.lede}>{t(lang, 'bin.lede')}</p>

            <BinList
                rows={rows}
                words={{
                    empty: t(lang, 'bin.empty'),
                    restore: t(lang, 'bin.restore'),
                    restoring: t(lang, 'bin.restoring'),
                    restored: t(lang, 'bin.restored'),
                    failed: t(lang, 'bin.failed'),
                }}
            />
        </main>
    );
}
