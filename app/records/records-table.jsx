'use client';

import { useMemo, useState } from 'react';
import { MindSheet } from '@aivocado/mindsheet';
import { useT } from '../lang-context';

// Same portable UI as the AI-Researcher app — "one code → two bases".
// Here it renders Fathom meeting records; there it renders the product catalog.
//the first three carry real words, the rest are raw column names from the
//database and stay as they are in every language
const columnsFor = (T) => [
  { key: 'date', label: T('records.colDate'), type: 'text', sortable: true },
  { key: 'shown', label: T('records.colShown'), type: 'text', sortable: true },
  { key: 'source', label: T('records.colSource'), type: 'select', sortable: true, filterable: true },
  { key: 'title', label: 'title', type: 'text' },
  { key: 'custom_title', label: 'custom_title', type: 'text' },
  { key: 'ai_title', label: 'ai_title', type: 'text' },
  { key: 'fathom_title', label: 'fathom_title', type: 'text' },
];

function hasValue(v) {
  return v !== null && v !== undefined && v !== '';
}

function compare(a, b, dir) {
  const factor = dir === 'asc' ? 1 : -1;
  if (!hasValue(a) && !hasValue(b)) return 0;
  if (!hasValue(a)) return 1;
  if (!hasValue(b)) return -1;
  return String(a).localeCompare(String(b), 'ru') * factor;
}

export default function RecordsTable({ rows }) {
  const T = useT();
  //rebuilt only when the language changes, so the memos below keep a stable dep
  const COLUMNS = useMemo(() => columnsFor(T), [T]);
  const [sort, setSort] = useState();
  // дополнительные уровни сортировки/группировки (Shift + клик), до 2 сверх первого
  const [extraLevels, setExtraLevels] = useState([]);
  const [filter, setFilter] = useState();
  const [search, setSearch] = useState('');

  // filter options come from the full set so a chosen value never hides the rest
  const facets = useMemo(() => {
    const out = {};
    for (const col of COLUMNS) {
      if (!col.filterable) continue;
      const set = new Set();
      for (const r of rows) if (hasValue(r[col.key])) set.add(String(r[col.key]));
      out[col.key] = [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }
    return out;
  }, [rows, COLUMNS]);

  const displayed = useMemo(() => {
    let out = [...rows];
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q),
      );
    }
    if (filter) out = out.filter((r) => String(r[filter.key] ?? '') === filter.value);
    if (sort) out.sort((a, b) => compare(a[sort.key], b[sort.key], sort.dir));
    return out;
  }, [rows, search, filter, sort]);

  const onSortChange = (key) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
    setExtraLevels([]);
  };

  // Shift/Ctrl + клик добавляет колонку следующим уровнем группировки (всего до 3)
  const onSortsChange = (key, additive) => {
    if (!additive) {
      onSortChange(key);
      return;
    }
    setExtraLevels((prev) => {
      if (sort?.key === key) return prev;
      const i = prev.findIndex((l) => l.key === key);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { key, dir: next[i].dir === 'asc' ? 'desc' : 'asc' };
        return next;
      }
      return prev.length >= 2 ? prev : [...prev, { key, dir: 'asc' }];
    });
  };

  const onSortReset = () => {
    setSort(undefined);
    setExtraLevels([]);
  };

  return (
    <MindSheet
      columns={COLUMNS}
      records={displayed}
      sort={sort}
      sorts={sort ? [sort, ...extraLevels] : extraLevels}
      filter={filter}
      filterOptions={facets}
      search={search}
      onSortChange={onSortChange}
      onSortsChange={onSortsChange}
      onSortReset={onSortReset}
      onFilterChange={setFilter}
      onSearchChange={setSearch}
      autoGroup
    />
  );
}
