'use client';

import { useState } from 'react';
import styles from './outline.module.css';

//spreadsheet-style outline grouping. each group that has more than one meeting
//gets a thin header line — a +/- toggle sitting in its gutter column plus the
//group's label and count — and its rows are drawn with bracket lines in the
//gutter. collapsing a group hides its rows, leaving just the header.
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

  //the gutter for a data row: a bracket line under every real (multi) group
  function bracketGutter(path) {
    const cells = [];
    for (let l = 0; l < levels; l += 1) {
      const seg = path[l];
      cells.push(
        <span key={l} className={styles.cell}>
          {seg && seg.count > 1 && <span className={styles.line} />}
        </span>,
      );
    }
    return cells;
  }

  //the gutter for a header line: bracket lines for parent levels, a toggle at
  //this level's column, empty after
  function headerGutter(path, level, isCollapsed) {
    const cells = [];
    for (let l = 0; l < levels; l += 1) {
      if (l === level) {
        cells.push(
          <span key={l} className={styles.cell}>
            <button
              type="button"
              onClick={() => toggle(path[level].key)}
              className={styles.toggle}
              data-open={!isCollapsed}
            >
              {isCollapsed ? '+' : '−'}
            </button>
          </span>,
        );
      } else {
        const seg = path[l];
        cells.push(
          <span key={l} className={styles.cell}>
            {l < level && seg && seg.count > 1 && <span className={styles.line} />}
          </span>,
        );
      }
    }
    return cells;
  }

  const out = [];

  for (let i = 0; i < meta.length; i += 1) {
    const entry = meta[i];
    const prev = meta[i - 1];
    const firstAt = entry.path.map((seg, l) => !prev || prev.path[l]?.key !== seg.key);

    //shallowest collapsed ancestor hides everything deeper
    let hiddenBy = -1;
    for (let l = 0; l < entry.path.length; l += 1) {
      if (collapsed.has(entry.path[l].key)) {
        hiddenBy = l;
        break;
      }
    }
    const maxLevel = hiddenBy >= 0 ? hiddenBy : entry.path.length - 1;

    //group headers that start at this row (down to the collapsed one, if any)
    for (let l = 0; l <= maxLevel; l += 1) {
      const seg = entry.path[l];
      if (!firstAt[l] || seg.count <= 1) continue;
      const isCollapsed = collapsed.has(seg.key);
      out.push(
        <div key={`h-${seg.key}`} className={styles.header}>
          <span className={styles.gutter} style={{ width: levels * CELL }}>
            {headerGutter(entry.path, l, isCollapsed)}
          </span>
          <span className={styles.label}>{seg.label}</span>
          <span className={styles.count}>{seg.count}</span>
        </div>,
      );
    }

    //the meeting row itself — only when nothing above it is collapsed
    if (hiddenBy < 0) {
      out.push(
        <div key={entry.id} className={styles.rowWrap}>
          <span className={styles.gutter} style={{ width: levels * CELL }}>
            {bracketGutter(entry.path)}
          </span>
          <span className={styles.rowSlot}>{rows[i]}</span>
        </div>,
      );
    }
  }

  return <div>{out}</div>;
}
