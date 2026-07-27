'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './sortable-header.module.css';

//built-in columns, the sort tag each maps to (lib/tags.js), and whether a
//multi-value filter makes sense (title/date/duration are one value per row)
const COLUMN_TAGS = [
  { label: 'Meeting', tag: 'title', filterable: false },
  { label: 'Types', tag: 'type', filterable: true },
  { label: 'Duration', tag: 'duration', filterable: false },
  { label: 'People', tag: 'people', filterable: true },
  { label: 'Date', tag: 'date', filterable: false },
  { label: 'Priority', tag: 'importance', filterable: true },
];

//clickable, filterable column headers (Excel/Sheets style):
//- click the label to sort by that column, click again to flip direction
//- open the ▾ to filter by one or more values at once
export default function SortableHeader({ facetsByTag = {}, columnFilters = {} }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openTag, setOpenTag] = useState(null);
  const boxRef = useRef(null);

  const activeTag = searchParams.get('tag') || 'date';
  const direction = searchParams.get('dir') || 'desc';

  useEffect(() => {
    if (!openTag) return undefined;

    const onClick = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpenTag(null);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpenTag(null);
    };

    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openTag]);

  function push(next) {
    router.push(next.toString() ? `/?${next.toString()}` : '/');
  }

  function sortBy(tag) {
    const next = new URLSearchParams(searchParams.toString());
    if (activeTag === tag) next.set('dir', direction === 'asc' ? 'desc' : 'asc');
    else {
      next.set('tag', tag);
      next.set('dir', 'asc');
    }
    push(next);
  }

  function toggleValue(tag, value) {
    const current = columnFilters[tag] ?? [];
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    const next = new URLSearchParams(searchParams.toString());
    if (nextValues.length) next.set(`c_${tag}`, nextValues.join('~'));
    else next.delete(`c_${tag}`);
    push(next);
  }

  function clearFilter(tag) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(`c_${tag}`);
    push(next);
  }

  return (
    <>
      {COLUMN_TAGS.map(({ label, tag, filterable }) => {
        const active = activeTag === tag;
        const chosen = columnFilters[tag] ?? [];
        const facets = facetsByTag[tag] ?? [];

        return (
          <span key={tag} className={styles.cell} ref={openTag === tag ? boxRef : null}>
            <button
              type="button"
              onClick={() => sortBy(tag)}
              data-active={active}
              className={styles.colHead}
              title={`Sort by ${label}`}
            >
              {label}
              <span className={styles.arrow}>{active ? (direction === 'asc' ? '↑' : '↓') : ''}</span>
            </button>

            {filterable && (
              <button
                type="button"
                onClick={() => setOpenTag(openTag === tag ? null : tag)}
                data-active={chosen.length > 0}
                className={styles.filterBtn}
                title={`Filter ${label}`}
              >
                ▾{chosen.length > 0 && <span className={styles.badge}>{chosen.length}</span>}
              </button>
            )}

            {openTag === tag && (
              <div className={styles.panel}>
                {facets.length === 0 ? (
                  <p className={styles.hint}>Нет значений</p>
                ) : (
                  <>
                    {facets.map((facet) => {
                      const on = chosen.includes(facet.value);
                      return (
                        <button
                          key={facet.value}
                          type="button"
                          onClick={() => toggleValue(tag, facet.value)}
                          data-active={on}
                          className={styles.option}
                        >
                          <span className={styles.box} data-on={on}>
                            {on && '✓'}
                          </span>
                          <span className={styles.optionLabel}>{facet.value}</span>
                          <span className={styles.count}>{facet.count}</span>
                        </button>
                      );
                    })}
                    {chosen.length > 0 && (
                      <button type="button" onClick={() => clearFilter(tag)} className={styles.clear}>
                        Сбросить
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </span>
        );
      })}
    </>
  );
}
