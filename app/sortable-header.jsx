'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildTags } from '@/lib/tags';
import { useLang, useT } from './lang-context';
import styles from './sortable-header.module.css';

//built-in columns in the order they appear, the sort tag each maps to
//(lib/tags.js), and whether a multi-value filter makes sense (title/date/
//duration are one value per row). The headings themselves come from the tag
//registry, so a column is named the same here and in the sorting panel.
const COLUMNS = [
  { tag: 'date', filterable: false },
  { tag: 'title', filterable: false },
  { tag: 'type', filterable: true },
  { tag: 'duration', filterable: false },
  { tag: 'people', filterable: true },
  { tag: 'importance', filterable: true },
];

//clickable, filterable column headers (Excel/Sheets style):
//- click the label to sort by that column, click again to flip direction
//- open the ▾ to filter by one or more values at once
export default function SortableHeader({ facetsByTag = {}, columnFilters = {} }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const T = useT();
  const tags = buildTags(lang);
  const [openTag, setOpenTag] = useState(null);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();
  //optimistic copy of the filters so a checkbox flips instantly, before the
  //server round-trip (which reloads the whole list) catches up. it is stamped
  //with the server state it was made against: when the server catches up the
  //stamp no longer matches and the copy is ignored — no effect, no extra
  //render, and no window where both are applied at once
  const [optimistic, setOptimistic] = useState({ against: null, values: {} });
  const boxRef = useRef(null);

  const filtersKey = JSON.stringify(columnFilters);
  const pending = optimistic.against === filtersKey ? optimistic.values : {};

  const chosenFor = (tag) => pending[tag] ?? columnFilters[tag] ?? [];

  //a filter panel opens with an empty search box
  function openFilter(tag) {
    setQuery('');
    setOpenTag(tag);
  }

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
    startTransition(() => {
      router.push(next.toString() ? `/?${next.toString()}` : '/');
    });
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
    const current = chosenFor(tag);
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    //flip the checkbox now, sync the URL in the background
    setOptimistic({ against: filtersKey, values: { ...pending, [tag]: nextValues } });

    const next = new URLSearchParams(searchParams.toString());
    if (nextValues.length) next.set(`c_${tag}`, nextValues.join('~'));
    else next.delete(`c_${tag}`);
    push(next);
  }

  function clearFilter(tag) {
    setOptimistic({ against: filtersKey, values: { ...pending, [tag]: [] } });
    const next = new URLSearchParams(searchParams.toString());
    next.delete(`c_${tag}`);
    push(next);
  }

  return (
    <>
      {COLUMNS.map(({ tag, filterable }) => {
        const label = tags[tag].label;
        const active = activeTag === tag;
        const chosen = chosenFor(tag);
        const facets = facetsByTag[tag] ?? [];

        return (
          <span
            key={tag}
            className={styles.cell}
            ref={openTag === tag ? boxRef : null}
            //a screen reader reads the table by its roles; without this the
            //heading is just a word floating above the rows
            role="columnheader"
            //and this is how it says "sorted by this column, newest first"
            aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            <button
              type="button"
              onClick={() => sortBy(tag)}
              data-active={active}
              className={styles.colHead}
              title={T('header.sortBy', { label })}
            >
              {label}
              <span className={styles.arrow}>{active ? (direction === 'asc' ? '↑' : '↓') : ''}</span>
            </button>

            {filterable && (
              <button
                type="button"
                onClick={() => openFilter(openTag === tag ? null : tag)}
                data-active={chosen.length > 0}
                className={styles.filterBtn}
                title={T('header.filterBy', { label })}
              >
                ▾{chosen.length > 0 && <span className={styles.badge}>{chosen.length}</span>}
              </button>
            )}

            {openTag === tag && (
              <div className={styles.panel}>
                {facets.length === 0 ? (
                  <p className={styles.hint}>{T('header.noValues')}</p>
                ) : (
                  <>
                    {facets.length > 6 && (
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={T('header.search')}
                        className={styles.search}
                        autoFocus
                      />
                    )}

                    {(() => {
                      const q = query.trim().toLowerCase();
                      //keep chosen values always visible, filter the rest by query
                      const list = facets.filter(
                        (f) => chosen.includes(f.value) || !q || f.value.toLowerCase().includes(q),
                      );
                      //chosen first, so what you picked never gets lost in the list
                      list.sort(
                        (a, b) =>
                          (chosen.includes(b.value) ? 1 : 0) - (chosen.includes(a.value) ? 1 : 0),
                      );

                      if (list.length === 0) {
                        return <p className={styles.hint}>{T('header.nothingFound')}</p>;
                      }

                      return list.map((facet) => {
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
                      });
                    })()}

                    {chosen.length > 0 && (
                      <button type="button" onClick={() => clearFilter(tag)} className={styles.clear}>
                        {T('header.reset')}
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
