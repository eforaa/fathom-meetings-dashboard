'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TYPE_LABELS } from '@/lib/format';
import styles from './filters.module.css';

//CSS class for each meeting type chip
const CHIP_CLASS = {
  internal_planning: styles.chipInternal,
  client_meeting: styles.chipClient,
  automation: styles.chipAutomation,
  onboarding: styles.chipOnboarding,
  other: styles.chipOther,
};
//sorting options
const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'duration:desc', label: 'Longest first' },
  { value: 'duration:asc', label: 'Shortest first' },
];

//closing dropdown if user clicks outside or pressing escape
function useDismissOnOutside(ref, isOpen, close) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) close();
    };

    const handleKey = (event) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ref, isOpen, close]);
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
//filters component
export default function Filters({ people }) {
  //router for URL updating
  const router = useRouter();
  //current search parameters
  const searchParams = useSearchParams();
  // dropdown open/closed
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useDismissOnOutside(dropdownRef, isDropdownOpen, () => setDropdownOpen(false));

  const selectedTypes = (searchParams.get('type') ?? '').split(',').filter(Boolean);
  const selectedPeople = (searchParams.get('person') ?? '').split(',').filter(Boolean);
  const sort = searchParams.get('sort') ?? 'date';
  //current sorting
  const dir = searchParams.get('dir') ?? 'desc';

  //updating filters in url
  function applyChanges(changes) {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }

    router.push(next.toString() ? `/?${next.toString()}` : '/');
  }

  //function to toggle meeting type filter, participant filter
  //and change sorting 
  function toggleType(type) {
    applyChanges({ type: toggle(selectedTypes, type).join(',') || null });
  }

  function togglePerson(identity) {
    applyChanges({ person: toggle(selectedPeople, identity).join(',') || null });
  }

  function changeSort(value) {
    const [nextSort, nextDir] = value.split(':');
    applyChanges({ sort: nextSort, dir: nextDir });
  }

  //transfer uppercase to lowercase when searching
  //filtering participants by search
  //checking if any filters are active
  const query = search.trim().toLowerCase();
  const visiblePeople = query
    ? people.filter((person) => person.label.toLowerCase().includes(query))
    : people;

  const hasFilters = selectedTypes.length > 0 || selectedPeople.length > 0;

  return (
    <div className={styles.bar}>
      <div className={styles.barInner}>
        <div className={styles.chips}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              data-active={selectedTypes.includes(type)}
              className={`${styles.chip} ${CHIP_CLASS[type] ?? ''}`}
            >
              <span className={styles.chipDot} />
              {label}
            </button>
          ))}
        </div>

        <span className={styles.divider} />

        <div className={styles.dropdown} ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((open) => !open)}
            data-active={selectedPeople.length > 0}
            aria-expanded={isDropdownOpen}
            className={styles.dropdownButton}
          >
            Participants
            {selectedPeople.length > 0 && (
              <span className={styles.badgeCount}>{selectedPeople.length}</span>
            )}
            <ChevronIcon open={isDropdownOpen} />
          </button>

          {isDropdownOpen && (
            <div className={styles.panel}>
              <div className={styles.search}>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                  className={styles.searchInput}
                  autoFocus
                />
              </div>

              <div className={styles.options}>
                {visiblePeople.length === 0 ? (
                  <p className={styles.notFound}>Nobody matches that.</p>
                ) : (
                  visiblePeople.map((person) => (
                    <PersonOption
                      key={person.identity}
                      person={person}
                      selected={selectedPeople.includes(person.identity)}
                      onToggle={togglePerson}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className={styles.sortWrap}>
          <select
            aria-label="Sort meetings"
            value={`${sort}:${dir}`}
            onChange={(event) => changeSort(event.target.value)}
            className={styles.sort}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <ChevronIcon className={styles.sortIcon} />
        </div>

        <span className={styles.spacer} />

        {hasFilters && (
          <button type="button" onClick={() => router.push('/')} className={styles.reset}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

//user option to choose
function PersonOption({ person, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(person.identity)}
      className={styles.option}
    >
      <span className={`${styles.checkbox} ${selected ? styles.checkboxOn : ''}`}>
        {selected && <CheckIcon />}
      </span>
      <span className={styles.optionLabel}>{person.label}</span>
    </button>
  );
}
//icon for dropdowns
function ChevronIcon({ open = false, className }) {
  const classes = [className ?? styles.chevron, open ? styles.chevronOpen : '']
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={classes}
    >
      <path
        d="M2.5 4L5 6.5L7.5 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 5.2L4 7.2L8 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}