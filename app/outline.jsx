'use client';

import { useState } from 'react';
import styles from './outline.module.css';

//Google-Sheets-style outline grouping: a left gutter with one column per
//grouping level; each group starts with a +/− in its column and a bracket line
//down its rows. Collapsing a level hides its rows and leaves a summary line.
const CELL = 22; //px width of one gutter column

export default function Outline({ meta, children }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const rows = Array.isArray(children) ? children : [children];
  const levels = meta.reduce((max, entry) => Math.max(max, entry.path.length), 0);

  function toggle(key) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const out = [];
  const summarised = new Set();

  for (let i = 0; i < meta.length; i += 1) {
    const entry = meta[i];
    const prev = meta[i - 1];
    //first row of a new group at each level
    const firstAt = entry.path.map((seg, l) => !prev || prev.path[l]?.key !== seg.key);

    //shallowest collapsed ancestor, if any
    let hiddenBy = -1;
    for (let l = 0; l < entry.path.length; l += 1) {
      if (collapsed.has(entry.path[l].key)) {
        hiddenBy = l;
        break;
      }
    }

    if (hiddenBy >= 0) {
      const seg = entry.path[hiddenBy];
      //one summary line per collapsed group, at its first row
      if (firstAt[hiddenBy] && !summarised.has(seg.key)) {
        summarised.add(seg.key);
        out.push(
          <div key={`s-${seg.key}`} className={styles.summary} style={{ paddingLeft: hiddenBy * CELL }}>
            <button type="button" onClick={() => toggle(seg.key)} className={styles.toggle} data-open="false">
              +
            </button>
            <span className={styles.label}>{seg.label}</span>
            <span className={styles.count}>{seg.count}</span>
          </div>,
        );
      }
      continue;
    }

    //visible row: gutter cells + the row itself.
    //only real groups (more than one meeting) get a toggle + bracket; a group
    //of one leaves its column empty so the gutter stays clean.
    const gutter = [];
    for (let l = 0; l < levels; l += 1) {
      const seg = entry.path[l];
      if (!seg || seg.count <= 1) {
        gutter.push(<span key={l} className={styles.cell} />);
      } else if (firstAt[l]) {
        gutter.push(
          <span key={l} className={styles.cell}>
            <button
              type="button"
              onClick={() => toggle(seg.key)}
              className={styles.toggle}
              data-open="true"
              title={`${seg.label} · ${seg.count}`}
            >
              −
            </button>
          </span>,
        );
      } else {
        gutter.push(
          <span key={l} className={styles.cell}>
            <span className={styles.line} />
          </span>,
        );
      }
    }

    out.push(
      <div key={entry.id} className={styles.rowWrap}>
        <span className={styles.gutter} style={{ width: levels * CELL }}>
          {gutter}
        </span>
        <span className={styles.rowSlot}>{rows[i]}</span>
      </div>,
    );
  }

  return <div>{out}</div>;
}
