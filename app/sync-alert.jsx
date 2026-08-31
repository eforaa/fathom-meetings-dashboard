import Link from 'next/link';
import { syncHealth, ago } from '@/lib/sync-health';
import { t } from '@/lib/i18n';
import styles from './sync-alert.module.css';

//Полоска «сбор молчит» над списком.
//
//Журнал синхронизаций мы завели, и он честно показывает состояние — на
//странице настроек, куда заходят раз в месяц. Значит, самое важное, что он
//умеет сказать («данные не обновляются третий день»), человек узнаёт с
//опозданием на этот самый месяц.
//
//Поэтому предупреждение переезжает туда, где люди бывают каждый день. И
//только предупреждение: пока всё в порядке, полоски нет вовсе — постоянная
//зелёная плашка «всё хорошо» перестаёт читаться на второй день и заодно учит
//не замечать это место.
export default function SyncAlert({ account, lang, now }) {
    if (!account) return null;

    const health = syncHealth({
        lastSyncedAt: account.last_synced_at,
        lastStatus: account.last_sync_status,
        now,
    });

    //«идёт по расписанию» и «ещё ни разу не доходил» — не повод для тревоги:
    //первое нормально, второе человек и так видит на пустом списке
    if (health.level === 'ok' || health.level === 'never') return null;

    const said = ago(health.hoursAgo);
    const since = said
        ? t(lang, 'sync.agoPattern', { value: said.value, unit: t(lang, `sync.unit.${said.unit}`) })
        : null;

    return (
        <p className={styles.bar} data-level={health.level} role="status">
            <span className={styles.dot} aria-hidden="true" />
            <span>
                {t(lang, `sync.level.${health.level}`, { n: health.missed })}
                {since && <span className={styles.since}> · {since}</span>}
            </span>
            <Link href="/settings" className={styles.link}>{t(lang, 'sync.title')}</Link>
        </p>
    );
}
