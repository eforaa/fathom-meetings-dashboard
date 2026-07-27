'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import styles from './sortable-header.module.css';

//built-in columns and the sort tag each one maps to (see lib/tags.js)
const COLUMN_TAGS = [
  { label: 'Meeting', tag: 'title' },
  { label: 'Types', tag: 'type' },
  { label: 'Duration', tag: 'duration' },
  { label: 'People', tag: 'people' },
  { label: 'Date', tag: 'date' },
  { label: 'Priority', tag: 'importance' },
];

//clickable column headers: a click sorts by that column (like Excel/Sheets),
//clicking the active column again flips the direction. Writes the primary sort
//slot (tag/dir) in the URL — the same one the side "Sorting" panel uses.
export default function SortableHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();

  //slot 0 keeps the short keys; date descending is the default view
  const activeTag = searchParams.get('tag') || 'date';
  const direction = searchParams.get('dir') || 'desc';

  function sortBy(tag) {
    const next = new URLSearchParams(searchParams.toString());

    if (activeTag === tag) {
      //same column → flip direction
      next.set('dir', direction === 'asc' ? 'desc' : 'asc');
    } else {
      //new column → sort ascending first
      next.set('tag', tag);
      next.set('dir', 'asc');
    }

    router.push(next.toString() ? `/?${next.toString()}` : '/');
  }

  return (
    <>
      {COLUMN_TAGS.map(({ label, tag }) => {
        const active = activeTag === tag;

        return (
          <button
            key={tag}
            type="button"
            onClick={() => sortBy(tag)}
            data-active={active}
            className={styles.colHead}
            title={`Sort by ${label}`}
          >
            {label}
            <span className={styles.arrow}>{active ? (direction === 'asc' ? '↑' : '↓') : ''}</span>
          </button>
        );
      })}
    </>
  );
}
