import { t } from '@/lib/i18n';
import styles from './stats.module.css';

//a compact band of key numbers above the table — a quick "state of meetings"
//read for a non-technical owner. all values are pre-computed on the server.
//a server component: the language arrives as a prop from the page, so no
//context is needed and nothing extra ships to the browser
export default function Stats({ total, hours, week, month, avg, lang }) {
  const tiles = [
    { label: t(lang, 'stats.meetings'), value: total },
    { label: t(lang, 'stats.hours'), value: hours },
    { label: t(lang, 'stats.week'), value: week },
    { label: t(lang, 'stats.month'), value: month },
    { label: t(lang, 'stats.average'), value: avg ? t(lang, 'duration.min', { n: avg }) : '—' },
  ];

  return (
    <section className={styles.wrap} aria-label={t(lang, 'stats.aria')}>
      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile}>
            <span className={styles.value}>{tile.value}</span>
            <span className={styles.label}>{tile.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

//The split of meetings by type — a proportional bar and its legend.
//It used to sit inside the band above the table, where it stretched across the
//whole width to say very little: one grey segment usually takes almost all of
//it. In the sidebar it fills space that was empty anyway, and the top of the
//page gets shorter.
export function TypesBar({ types, lang }) {
  if (!types.length) return null;

  const total = types.reduce((sum, type) => sum + type.count, 0);

  return (
    <section className={styles.types} aria-label={t(lang, 'stats.aria')}>
      <div className={styles.bar}>
        {types.map((type) => (
          <span
            key={type.key}
            className={styles.seg}
            data-type={type.key}
            style={{ width: `${(type.count / total) * 100}%` }}
            title={`${type.label}: ${type.count}`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {types.map((type) => (
          <span key={type.key} className={styles.legendItem}>
            <span className={styles.dot} data-type={type.key} />
            {type.label}
            <span className={styles.legendCount}>{type.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
