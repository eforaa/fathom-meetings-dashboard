import { t } from '@/lib/i18n';
import styles from './stats.module.css';

//One quiet block at the top of the sidebar, read top to bottom:
//  the meeting count, then the four figures, then the split by type.
//
//It used to be a card of five big tiles running across the whole page. Same
//numbers, a fraction of the room — the table is what the page is for.
//
//There is no proportional bar: it stretched to whatever width it was given and
//said almost nothing, since one grey "no type" segment took nearly all of it.
export default function Stats({ total, hours, week, month, avg, types, lang }) {
  const figures = [
    { label: t(lang, 'stats.hours'), value: hours },
    { label: t(lang, 'stats.week'), value: week },
    { label: t(lang, 'stats.month'), value: month },
    { label: t(lang, 'stats.average'), value: avg ? t(lang, 'duration.min', { n: avg }) : '—' },
  ];

  return (
    <section className={styles.summary} aria-label={t(lang, 'stats.aria')}>
      <p className={styles.total}>
        <span className={styles.totalValue}>{total}</span>
        <span className={styles.totalLabel}>{t(lang, 'stats.meetings')}</span>
      </p>

      <p className={styles.figures}>
        {figures.map((figure) => (
          <span key={figure.label} className={styles.figure}>
            <span className={styles.figureValue}>{figure.value}</span>
            {figure.label}
          </span>
        ))}
      </p>

      {types.length > 0 && (
        <p className={styles.split}>
          {types.map((type) => (
            <span key={type.key} className={styles.item}>
              <span className={styles.dot} data-type={type.key} />
              {type.label}
              <span className={styles.count}>{type.count}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
