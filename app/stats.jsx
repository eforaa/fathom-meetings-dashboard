import { t } from '@/lib/i18n';
import styles from './stats.module.css';

//a compact band of key numbers above the table — a quick "state of meetings"
//read for a non-technical owner. all values are pre-computed on the server.
//a server component: the language arrives as a prop from the page, so no
//context is needed and nothing extra ships to the browser
export default function Stats({ total, hours, week, month, avg, types, lang }) {
  const tiles = [
    { label: t(lang, 'stats.meetings'), value: total },
    { label: t(lang, 'stats.hours'), value: hours },
    { label: t(lang, 'stats.week'), value: week },
    { label: t(lang, 'stats.month'), value: month },
    { label: t(lang, 'stats.average'), value: avg ? t(lang, 'duration.min', { n: avg }) : '—' },
  ];

  const typeTotal = types.reduce((sum, t) => sum + t.count, 0);

  return (
    <section className={styles.wrap} aria-label={t(lang, 'stats.aria')}>
      <div className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.label} className={styles.tile}>
            <span className={styles.value}>{t.value}</span>
            <span className={styles.label}>{t.label}</span>
          </div>
        ))}
      </div>

      {types.length > 0 && (
        <div className={styles.types}>
          <div className={styles.bar}>
            {types.map((t, i) => (
              <span
                key={t.key}
                className={styles.seg}
                data-type={t.key}
                style={{ width: `${(t.count / typeTotal) * 100}%` }}
                title={`${t.label}: ${t.count}`}
              />
            ))}
          </div>
          <div className={styles.legend}>
            {types.map((t, i) => (
              <span key={t.key} className={styles.legendItem}>
                <span className={styles.dot} data-type={t.key} />
                {t.label}
                <span className={styles.legendCount}>{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
