import { t } from '@/lib/i18n';
import styles from './stats.module.css';

//One quiet block in the sidebar: how many meetings there are, and how they
//split by type. It replaces the wide band that used to sit above the table
//with five tiles — hours, this week, this month, average. Those numbers were
//read once and then ignored, and they cost a full row across the page.
//Deliberately understated: no card, no shadow, small type. The table is what
//the page is for.
export default function Stats({ total, types, lang }) {
  const typeTotal = types.reduce((sum, type) => sum + type.count, 0);

  return (
    <section className={styles.summary} aria-label={t(lang, 'stats.aria')}>
      <p className={styles.total}>
        <span className={styles.totalValue}>{total}</span>
        <span className={styles.totalLabel}>{t(lang, 'stats.meetings')}</span>
      </p>

      {types.length > 0 && (
        <>
          <div className={styles.bar}>
            {types.map((type) => (
              <span
                key={type.key}
                className={styles.seg}
                data-type={type.key}
                style={{ width: `${(type.count / typeTotal) * 100}%` }}
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
        </>
      )}
    </section>
  );
}
