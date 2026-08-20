import { t } from '@/lib/i18n';
import { syncHealth, ago, quietFor } from '@/lib/sync-health';
import styles from './sync-log.module.css';

//История сбора встреч на странице настроек.
//
//До сих пор здесь стояла одна строка «последняя синхронизация: <дата>». Она
//отвечает на вопрос «когда», но не на вопрос «а он вообще работает» — а
//спрашивают всегда второе, и обычно в тот день, когда данные не пришли.
//
//Серверный компонент: журнал читается прямо при отрисовке страницы, без
//отдельного запроса из браузера.

function when(iso, lang) {
    if (!iso) return '—';

    return new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'uk-UA', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

//«3 ч назад». Сокращения выбраны нарочно: полные слова требуют согласования с
//числом (час/часа/часов), а сокращение одинаково для любого числа во всех трёх
//языках
function relative(hoursAgo, lang) {
    const said = ago(hoursAgo);
    if (!said) return null;

    return t(lang, 'sync.agoPattern', {
        value: said.value,
        unit: t(lang, `sync.unit.${said.unit}`),
    });
}

export default function SyncLog({ account, runs, lang, now }) {
    if (!account) return null;

    const health = syncHealth({
        lastSyncedAt: account.last_synced_at,
        lastStatus: account.last_sync_status,
        now,
    });

    const quiet = quietFor(runs);
    const since = relative(health.hoursAgo, lang);

    return (
        <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t(lang, 'sync.title')}</h2>

            <div className={styles.card}>
                <p className={styles.state} data-level={health.level}>
                    <span className={styles.dot} aria-hidden="true" />
                    <span>
                        {t(lang, `sync.level.${health.level}`, { n: health.missed })}
                        {since && <span className={styles.since}> · {since}</span>}
                    </span>
                </p>

                {/* тишина при полном порядке: запуски проходят, но ничего не
                    приносят. Это не тревога — неделя без встреч бывает, — но
                    заметить её стоит раньше, чем через месяц */}
                {quiet >= 3 && (
                    <p className={styles.quiet}>{t(lang, 'sync.quiet', { n: quiet })}</p>
                )}

                {runs.length === 0 ? (
                    <p className={styles.empty}>{t(lang, 'sync.empty')}</p>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">{t(lang, 'sync.col.when')}</th>
                                <th scope="col">{t(lang, 'sync.col.source')}</th>
                                <th scope="col">{t(lang, 'sync.col.result')}</th>
                                <th scope="col" className={styles.num}>{t(lang, 'sync.col.new')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((run) => (
                                <tr key={run.id}>
                                    <td>{when(run.started_at, lang)}</td>
                                    <td>{t(lang, `sync.source.${run.source}`)}</td>
                                    <td>
                                        {/* ok === null — запуск открыт и не закрыт: он не
                                            дожил до конца. Это не успех и не ошибка, и
                                            называть его надо третьим словом */}
                                        <span
                                            className={styles.result}
                                            data-result={run.ok === true ? 'ok' : run.ok === false ? 'failed' : 'cut'}
                                        >
                                            {t(lang, `sync.result.${run.ok === true ? 'ok' : run.ok === false ? 'failed' : 'cut'}`)}
                                        </span>
                                        {run.ok === false && run.error && (
                                            <span className={styles.error} title={run.error}>{run.error}</span>
                                        )}
                                    </td>
                                    <td className={styles.num}>{run.inserted ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}
