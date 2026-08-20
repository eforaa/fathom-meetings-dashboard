import { t } from '@/lib/i18n';
import styles from './stats.module.css';

//Сводка над панелью сортировки: сколько встреч, четыре цифры и разбивка по
//типам.
//
//Раньше это были пять строчек мелким серым — цифры присутствовали, но глазу
//не за что было зацепиться, и блок читался как отладочный вывод. Теперь у него
//есть устройство: крупное число сверху, четыре цифры сеткой два на два, ниже
//типы — каждый со своей полосой длины.
//
//Про полосы. Общей составной полосы здесь по-прежнему нет: она растягивалась
//на любую ширину и почти ничего не говорила, потому что один серый кусок «без
//типа» съедал её почти целиком. Полоса у каждой строки своей длины этой беды
//лишена — строки сравниваются друг с другом, а не с одним великаном.
export default function Stats({ total, hours, week, month, avg, types, lang }) {
  const figures = [
    { label: t(lang, 'stats.hours'), value: hours },
    { label: t(lang, 'stats.week'), value: week },
    { label: t(lang, 'stats.month'), value: month },
    { label: t(lang, 'stats.average'), value: avg ? t(lang, 'duration.min', { n: avg }) : '—' },
  ];

  //Длина полосы считается от самого частого НАСТОЯЩЕГО типа. Двумя оговорками
  //сразу:
  //  — не от общего числа встреч, потому что у встречи может быть несколько
  //    типов, и сумма по типам законно бывает больше, чем встреч; доля от
  //    такой суммы была бы выдумкой;
  //  — «без типа» из счёта исключён. Обычно он крупнее всех настоящих типов
  //    вместе взятых, и если мерить от него, все остальные полосы съёживаются
  //    в одинаковые огрызки — сравнивать становится нечего.
  const busiest = types
    .filter((type) => type.key !== '__untyped')
    .reduce((top, type) => Math.max(top, type.count), 0);

  return (
    <section className={styles.summary} aria-label={t(lang, 'stats.aria')}>
      <p className={styles.total}>
        <span className={styles.totalValue}>{total}</span>
        <span className={styles.totalLabel}>{t(lang, 'stats.meetings')}</span>
      </p>

      <dl className={styles.figures}>
        {figures.map((figure) => (
          <div key={figure.label} className={styles.figure}>
            <dd className={styles.figureValue}>{figure.value}</dd>
            <dt className={styles.figureLabel}>{figure.label}</dt>
          </div>
        ))}
      </dl>

      {types.length > 0 && (
        <ul className={styles.split}>
          {types.map((type) => (
            <li key={type.key} className={styles.item} data-type={type.key}>
              {/* полоса — фон строки, а не отдельная деталь: так она добавляет
                  ритм, ничего не занимая по высоте. Число рядом говорит то же
                  самое точно, поэтому от полосы скрывающему её читателю ничего
                  не теряется */}
              <span
                className={styles.bar}
                style={{ '--share': busiest ? Math.min(1, type.count / busiest) : 0 }}
                aria-hidden="true"
              />
              <span className={styles.dot} data-type={type.key} />
              <span className={styles.label}>{type.label}</span>
              <span className={styles.count}>{type.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
