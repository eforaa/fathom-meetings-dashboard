'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TAG_OPTIONS, TAGS } from '@/lib/tags';
import styles from './slot.module.css';

//closing a panel on outside click or Escape
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

//one slot: a column the person fills with a tag
//S is the sorting row, F is the filter row
export default function Slot({ slot, facets }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [openPanel, setOpenPanel] = useState(null);
    const tagRef = useRef(null);
    const filterRef = useRef(null);

    useDismissOnOutside(tagRef, openPanel === 'tag', () => setOpenPanel(null));
    useDismissOnOutside(filterRef, openPanel === 'filter', () => setOpenPanel(null));

    //state lives in the URL, so a view can be sent as a link
    function apply(changes) {
        const next = new URLSearchParams(searchParams.toString());

        for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }

        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    //choosing another tag drops the filter: its values belong to the old tag
    function chooseTag(tagId) {
        apply({ tag: tagId, fval: null });
        setOpenPanel(null);
    }

    //direction changes by pressing again, like in Finder
    function toggleDirection() {
        apply({ dir: slot.direction === 'asc' ? 'desc' : 'asc' });
    }

    function toggleMode() {
        apply({ fmode: slot.filterMode === 'keep' ? 'exclude' : 'keep' });
    }

    function toggleValue(value) {
        const next = slot.filterValues.includes(value)
            ? slot.filterValues.filter((item) => item !== value)
            : [...slot.filterValues, value];

        apply({ fval: next.join('~') || null });
    }

    const tagLabel = TAGS[slot.tag]?.label ?? 'Tag';
    const chosenCount = slot.filterValues.length;

    return (
        <div className={styles.slot}>
            {/* sorting row */}
            <div className={styles.row}>
                <span className={styles.marker}>S</span>

                <div className={styles.dropdown} ref={tagRef}>
                    <button
                        type="button"
                        onClick={() => setOpenPanel(openPanel === 'tag' ? null : 'tag')}
                        className={styles.control}
                    >
                        {tagLabel}
                        <Chevron open={openPanel === 'tag'} />
                    </button>

                    {openPanel === 'tag' && (
                        <div className={styles.panel}>
                            {TAG_OPTIONS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => chooseTag(option.id)}
                                    data-active={option.id === slot.tag}
                                    className={styles.option}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={toggleDirection}
                    className={styles.direction}
                    title={slot.direction === 'asc' ? 'Ascending' : 'Descending'}
                >
                    {slot.direction === 'asc' ? '↑' : '↓'}
                </button>
            </div>

            {/* filter row */}
            <div className={styles.row}>
                <span className={styles.marker}>F</span>

                <div className={styles.dropdown} ref={filterRef}>
                    <button
                        type="button"
                        onClick={() => setOpenPanel(openPanel === 'filter' ? null : 'filter')}
                        data-active={chosenCount > 0}
                        className={styles.control}
                    >
                        {chosenCount ? `${chosenCount} selected` : 'All values'}
                        <Chevron open={openPanel === 'filter'} />
                    </button>

                    {openPanel === 'filter' && (
                        <div className={styles.panel}>
                            {facets.length === 0 ? (
                                <p className={styles.empty}>No values</p>
                            ) : (
                                facets.map((facet) => {
                                    const on = slot.filterValues.includes(facet.value);

                                    return (
                                        <button
                                            key={facet.value}
                                            type="button"
                                            onClick={() => toggleValue(facet.value)}
                                            className={styles.option}
                                        >
                                            <span
                                                className={`${styles.checkbox} ${on ? styles.checkboxOn : ''}`}
                                            >
                                                {on && <Check />}
                                            </span>
                                            <span className={styles.optionLabel}>{facet.value}</span>
                                            <span className={styles.count}>{facet.count}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={toggleMode}
                    data-mode={slot.filterMode}
                    className={styles.mode}
                    title="Keep or exclude the chosen values"
                >
                    {slot.filterMode === 'keep' ? 'keep' : 'exclude'}
                </button>
            </div>
        </div>
    );
}

function Chevron({ open }) {
    return (
        <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
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

function Check() {
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