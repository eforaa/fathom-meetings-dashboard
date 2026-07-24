'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TAG_OPTIONS, TAGS } from '@/lib/tags';
import { MEETING_TYPES, typeLabel } from '@/lib/format';
import styles from './slot.module.css';

//css colour of a type, looked up by its readable label
//the filter works with labels, the palette is keyed by id
const TYPE_COLOR = Object.fromEntries(
    MEETING_TYPES.map((type) => [typeLabel(type), `var(--type-${type.split('_')[0]})`]),
);

//sorting levels, their filters and the grouping, all in one panel
export default function Slot({ slots, facetsBySlot, group }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    //open by default: it is a side panel, not a dropdown
    const [panelOpen, setPanelOpen] = useState(true);
    //which levels show their filter, kept in the component: it is not a view
    const [expanded, setExpanded] = useState([]);

    //state lives in the URL, so a view can be sent as a link
    function apply(changes) {
        const next = new URLSearchParams(searchParams.toString());

        for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }

        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    const levels = slots.filter((slot) => TAGS[slot.tag]);
    const firstEmpty = slots.find((slot) => !TAGS[slot.tag]);

    //a new level takes the first tag nobody uses yet
    function addLevel() {
        if (!firstEmpty) return;

        const used = levels.map((level) => level.tag);
        const free = TAG_OPTIONS.find((option) => !used.includes(option.id));

        apply({ [firstEmpty.keys.tag]: free?.id ?? TAG_OPTIONS[0].id });
    }

    //removing clears every key of that level, nothing stays in the address bar
    function removeLevel(slot) {
        apply({
            [slot.keys.tag]: null,
            [slot.keys.dir]: null,
            [slot.keys.fmode]: null,
            [slot.keys.fval]: null,
        });
    }

    function toggleExpanded(id) {
        setExpanded((current) =>
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
        );
    }

    return (
        <section className={styles.panel}>
            <button
                type="button"
                onClick={() => setPanelOpen(!panelOpen)}
                className={styles.panelHead}
            >
                <span className={styles.caret} data-open={panelOpen}>
                    ▶
                </span>
                Sorting
                {!panelOpen && <span className={styles.panelSummary}>{summarize(levels, group)}</span>}
            </button>

            {panelOpen && (
                <div className={styles.panelBody}>
                    <p className={styles.groupTitle}>Sorting and filters, by level</p>

                    {levels.map((slot, position) => (
                        <Level
                            key={slot.index}
                            slot={slot}
                            position={position}
                            facets={facetsBySlot[slot.index] ?? []}
                            apply={apply}
                            onRemove={() => removeLevel(slot)}
                            canRemove={levels.length > 1}
                            open={expanded.includes(slot.index)}
                            onToggleOpen={() => toggleExpanded(slot.index)}
                        />
                    ))}

                    {firstEmpty && (
                        <button type="button" onClick={addLevel} className={styles.addLevel}>
                            + add level
                        </button>
                    )}

                    <div className={styles.groupRow}>
                        <span className={styles.groupTitle}>Group by</span>

                        <div className={styles.pills}>
                            <button
                                type="button"
                                onClick={() => apply({ group: null })}
                                data-active={!group}
                                className={styles.pill}
                            >
                                none
                            </button>
                            {TAG_OPTIONS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => apply({ group: option.id })}
                                    data-active={option.id === group}
                                    className={styles.pill}
                                >
                                    {option.label.toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

//one sorting level: a field, a direction and its own filter
function Level({ slot, position, facets, apply, onRemove, canRemove, open, onToggleOpen }) {
    const tag = TAGS[slot.tag];
    //dates and titles hold one value per row, picking from such a list is useless
    const pickable = tag.pickable !== false;
    const chosen = slot.filterValues.length;

    function chooseTag(tagId) {
        //values of the old tag mean nothing to the new one
        apply({ [slot.keys.tag]: tagId, [slot.keys.fval]: null });
    }

    function toggleValue(value) {
        const next = slot.filterValues.includes(value)
            ? slot.filterValues.filter((item) => item !== value)
            : [...slot.filterValues, value];

        apply({ [slot.keys.fval]: next.join('~') || null });
    }

    return (
        <div className={styles.level}>
            <div className={styles.levelHead}>
                <button
                    type="button"
                    onClick={onToggleOpen}
                    className={styles.levelCaret}
                    title="Show the filter"
                    disabled={!pickable}
                >
                    <span className={styles.caret} data-open={open}>
                        ▶
                    </span>
                </button>

                <span className={styles.levelNumber}>{position + 1}</span>

                <span className={styles.selectWrap}>
                    <select
                        value={slot.tag}
                        onChange={(event) => chooseTag(event.target.value)}
                        className={styles.select}
                    >
                        {TAG_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <span className={styles.selectArrow}>▾</span>
                </span>

                {/* direction changes by pressing again, like in Finder */}
                <button
                    type="button"
                    onClick={() =>
                        apply({ [slot.keys.dir]: slot.direction === 'asc' ? 'desc' : 'asc' })
                    }
                    className={styles.direction}
                    title={slot.direction === 'asc' ? 'Ascending' : 'Descending'}
                >
                    {slot.direction === 'asc' ? '↑' : '↓'}
                </button>

                {chosen > 0 && (
                    <span className={styles.levelTag}>
                        · {chosen} {slot.filterMode === 'exclude' ? 'excluded' : 'kept'}
                    </span>
                )}

                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className={styles.levelRemove}
                        title="Remove this level"
                    >
                        ×
                    </button>
                )}
            </div>

            {open && (
                <div className={styles.levelBody}>
                    {pickable ? (
                        <>
                            <div className={styles.modeRow}>
                                <span className={styles.groupTitle}>
                                    {slot.filterMode === 'exclude' ? 'Leave out' : 'Keep only'}
                                </span>

                                <div className={styles.modeToggle}>
                                    <button
                                        type="button"
                                        onClick={() => apply({ [slot.keys.fmode]: null })}
                                        data-active={slot.filterMode === 'keep'}
                                        className={styles.modeButton}
                                    >
                                        keep
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => apply({ [slot.keys.fmode]: 'exclude' })}
                                        data-active={slot.filterMode === 'exclude'}
                                        className={styles.modeButton}
                                    >
                                        exclude
                                    </button>
                                </div>
                            </div>

                            {facets.length === 0 ? (
                                <p className={styles.note}>No values</p>
                            ) : (
                                <div className={styles.values}>
                                    {facets.map((facet) => {
                                        const on = slot.filterValues.includes(facet.value);
                                        const dot = TYPE_COLOR[facet.value];

                                        return (
                                            <button
                                                key={facet.value}
                                                type="button"
                                                onClick={() => toggleValue(facet.value)}
                                                data-active={on}
                                                className={styles.value}
                                            >
                                                <span className={styles.box} data-on={on}>
                                                    {on && '✓'}
                                                </span>
                                                {dot && (
                                                    <span
                                                        className={styles.dot}
                                                        style={{ background: dot }}
                                                    />
                                                )}
                                                {facet.value}
                                                <span className={styles.count}>{facet.count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className={styles.note}>
                            “{tag.label}” only sets the order, there is nothing to pick from.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

//one line describing the whole panel while it is folded away
function summarize(levels, group) {
    const order = levels
        .map((slot) => `${TAGS[slot.tag].label} ${slot.direction === 'asc' ? '↑' : '↓'}`)
        .join(' → ');

    const grouped = group ? `, grouped by ${TAGS[group].label.toLowerCase()}` : '';
    return `${order}${grouped}`;
}
