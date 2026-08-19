import { t } from '@/lib/i18n';
import styles from './stats.module.css';

//One quiet block in the sidebar: how many meetings there are, and how they
//split by type.
//
//There is no proportional bar any more. It said almost nothing — one grey
//"no type" segment took 96% of it — while stretching to whatever width it was
//given, which on a narrow screen meant the full page. The counts carry the
//same information in a line of text.
export default function Stats({ total, types, lang }) {
  return (
    <section className={styles.summary} aria-label={t(lang, 'stats.aria')}>
      <p className={styles.total}>
        <span className={styles.totalValue}>{total}</span>
        <span className={styles.totalLabel}>{t(lang, 'stats.meetings')}</span>
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
