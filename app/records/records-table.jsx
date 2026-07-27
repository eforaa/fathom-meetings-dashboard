'use client';

import { useMemo, useState } from 'react';
import styles from './records.module.css';

//the raw fields shown as columns, in the order the naming rule reads them
const FIELDS = ['custom_title', 'ai_title', 'title', 'fathom_title'];

//a client-side search over the raw records; server already scoped them to the
//signed-in owner, so this only narrows what is already on screen
export default function RecordsTable({ rows }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.shown, row.title, row.custom_title, row.ai_title, row.fathom_title]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  return (
    <>
      <div className={styles.toolbar}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названиям…"
          className={styles.search}
        />
        <span className={styles.count}>
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thDate}>Date</th>
              <th className={styles.thShown}>Shown</th>
              {FIELDS.map((field) => (
                <th key={field}>
                  <code>{field}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className={styles.date}>{row.date}</td>
                <td className={styles.shown}>{row.shown}</td>
                {FIELDS.map((field) => (
                  <td
                    key={field}
                    className={row.source === field ? styles.active : styles.muted}
                  >
                    {row[field] || <span className={styles.empty}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && <p className={styles.none}>Ничего не найдено</p>}
      </div>
    </>
  );
}
