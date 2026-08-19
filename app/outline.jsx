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
        //a group line is a row of the table with one cell: read aloud it
        //should say the group and how many meetings are in it
        <div key={`h-${seg.key}`} className={styles.header} role="row">
          <span className={styles.gutter} style={{ width: levels * CELL }} role="presentation">
            {headerGutter(entry.path, l, isCollapsed)}
          </span>
          <span className={styles.label} role="cell">{seg.label}</span>
          <span className={styles.count} role="cell">{seg.count}</span>
        </div>,
      );
    }

    //the meeting row itself — only when nothing above it is collapsed
    if (hiddenBy < 0) {
      out.push(
        //these three only draw the gutter brackets; the row inside them is
        //the real thing, so they step out of the way of the roles
        <div key={entry.id} className={styles.rowWrap} role="presentation">
          <span className={styles.gutter} style={{ width: levels * CELL }} role="presentation">
            {bracketGutter(entry.path)}
          </span>
          <span className={styles.rowSlot} role="presentation">{rows[i]}</span>
        </div>,
      );
    }
  }

  return <div role="presentation">{out}</div>;
}
