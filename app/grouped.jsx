'use client';

import { useState } from 'react';
import styles from './page.module.css';

//a collapsible group of rows
//rows are plain blocks now, so one component serves the grid and the cards
export default function Group({ label, count, children }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.group}>
      <button type="button" onClick={() => setOpen(!open)} className={styles.groupHead}>
        <span className={styles.groupCaret} data-open={open}>
          ▶
        </span>
        <span className={styles.groupLabel}>{label}</span>
        <span className={styles.groupCount}>{count}</span>
        <span className={styles.groupRule} />
      </button>

      {open && children}
    </div>
  );
}
