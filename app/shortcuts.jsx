'use client';

import { useEffect, useState } from 'react';
import { useT } from './lang-context';
import { isTyping } from '@/lib/keys';
import styles from './shortcuts.module.css';

//The shortcuts that actually exist live in lib/keys.js — this overlay is just a
//readable picture of them, so the two must stay in step. "?" opens and closes it.
const ROWS = [
  { keys: ['↑', '↓', 'j', 'k'], label: 'shortcuts.nav' },
  { keys: ['Home / g', 'End / G'], label: 'shortcuts.ends' },
  { keys: ['Enter'], label: 'shortcuts.open' },
  { keys: ['/'], label: 'shortcuts.search' },
  { keys: ['x'], label: 'shortcuts.mark' },
  { keys: ['Shift', 'X'], label: 'shortcuts.range' },
  { keys: ['a'], label: 'shortcuts.all' },
  { keys: ['Esc'], label: 'shortcuts.esc' },
  { keys: ['?'], label: 'shortcuts.help' },
];

export default function Shortcuts() {
  const [open, setOpen] = useState(false);
  const T = useT();

  useEffect(() => {
    function onKey(event) {
      //while open, Escape closes the help — and only the help. Capture phase so
      //RowNav (which also treats Escape as "clear the cursor") never sees it.
      if (open && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      //never steal "?" from someone writing a title; leave browser combos alone
      const typing = isTyping(event.target?.tagName, event.target?.isContentEditable);
      if (!typing && event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={T('shortcuts.title')}
    >
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>{T('shortcuts.title')}</h2>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={T('shortcuts.close')}>
            ×
          </button>
        </div>
        <ul className={styles.list}>
          {ROWS.map((r) => (
            <li key={r.label} className={styles.item}>
              <span className={styles.keys}>
                {r.keys.map((k) => (
                  <kbd key={k} className={styles.kbd}>{k}</kbd>
                ))}
              </span>
              <span className={styles.desc}>{T(r.label)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
