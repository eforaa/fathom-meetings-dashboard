'use client';

import { useState } from 'react';
import styles from './page.module.css';

//collapsible group header inside the table
//the header is a row spanning every column, click toggles the rows under it
export function TableGroup({ label, count, colSpan, children }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <tr className={styles.groupRow} onClick={() => setOpen(!open)}>
        <td colSpan={colSpan} className={styles.groupCell}>
          <span className={styles.groupToggle}>{open ? '−' : '+'}</span>
          <span className={styles.groupLabel}>{label}</span>
          <span className={styles.groupCount}>{count}</span>
        </td>
      </tr>
      {open && children}
    </>
  );
}

//collapsible group for the mobile cards
export function CardGroup({ label, count, children }) {
  const [open, setOpen] = useState(true);

  return (
    <li className={styles.cardGroup}>
      <button
        type="button"
        className={styles.groupCardHeader}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.groupToggle}>{open ? '−' : '+'}</span>
        <span className={styles.groupLabel}>{label}</span>
        <span className={styles.groupCount}>{count}</span>
      </button>
      {open && <ul className={styles.cards}>{children}</ul>}
    </li>
  );
}
