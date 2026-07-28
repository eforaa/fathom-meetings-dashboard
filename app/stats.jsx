import styles from './stats.module.css';

//a compact band of key numbers above the table — a quick "state of meetings"
//read for a non-technical owner. all values are pre-computed on the server.
export default function Stats({ total, hours, week, month, avg, types }) {
  const tiles = [
    { label: 'Встреч', value: total },
    { label: 'Часов всего', value: hours },
    { label: 'За неделю', value: week },
    { label: 'За месяц', value: month },
    { label: 'Средняя', value: avg ? `${avg} мин` : '—' },
  ];

  const typeTotal = types.reduce((sum, t) => sum + t.count, 0);

  return (
    <section className={styles.wrap} aria-label="Статистика встреч">
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
