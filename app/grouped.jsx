'use client';

import { useState } from 'react';
import styles from './page.module.css';

//a collapsible group of rows, nestable into a tree via `depth`
//rows are plain blocks now, so one component serves the grid and the cards
export default function Group({ label, count, children, depth = 0 }) {
  const [open, setOpen] = useState(true);

  //deeper levels step their header to the right so the tree reads at a glance
  const headStyle = depth ? { paddingLeft: `${20 + depth * 18}px` } : undefined;

  return (
    <div className={styles.group} data-depth={depth}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={styles.groupHead}
        style={headStyle}
      >
        <span className={styles.groupCaret} data-open={open}>
          ▶
        </span>
        <span className={styles.groupLabel} data-depth={depth}>
          {label}
        </span>
        <span className={styles.groupCount}>{count}</span>
        <span className={styles.groupRule} />
      </button>

      {open && children}
    </div>
  );
}
