'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildTags, tagOptions } from '@/lib/tags';
import { MEETING_TYPES, typeLabel } from '@/lib/format';
import { useLang, useT } from './lang-context';
import styles from './slot.module.css';

//css colour of a type, looked up by its readable label
//the filter works with labels, the palette is keyed by id
//colours keyed by the readable label, so the map is rebuilt per language
const typeColors = (lang) =>
    Object.fromEntries(
        MEETING_TYPES.map((type) => [typeLabel(type, lang), `var(--type-${type.split('_')[0]})`]),
    );

//sorting levels, their filters and the grouping, all in one panel
//url keys for the three nested grouping levels (the "3 columns")
const GROUP_KEYS = ['group', 'group2', 'group3'];

export default function Slot({ slots, facetsBySlot, groups = [] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const lang = useLang();
    const T = useT();
    //labels change with the language, ids do not
    const TAGS = buildTags(lang);
    const TAG_OPTIONS = tagOptions(lang);

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
                {T('sort.panel')}
                {!panelOpen && (
                    <span className={styles.panelSummary}>{summarize(levels, groups, TAGS, T)}</span>
                )}
            </button>

            {panelOpen && (
                <div className={styles.panelBody}>
                    <p className={styles.groupTitle}>{T('sort.byLevel')}</p>

                    {levels.map((slot, position) => (
                        <Level
                            key={slot.index}
                            slot={slot}
                            tags={TAGS}
                            tagOptions={TAG_OPTIONS}
                            T={T}
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
                            {T('sort.addLevel')}
                        </button>
                    )}

                    {/* nested grouping: up to three levels form a tree */}
                    {GROUP_KEYS.map((key, level) => {
                        //a deeper level only appears once the one above is set
                        if (level > 0 && !groups[level - 1]) return null;

                        const current = groups[level] ?? '';
                        //tags already used on other levels can't be picked again
                        const used = groups.filter((_, i) => i !== level);

                        //"none" on a level clears it and every deeper level
                        const clearFrom = () => {
                            const changes = {};
                            for (let i = level; i < GROUP_KEYS.length; i += 1) changes[GROUP_KEYS[i]] = null;
                            return changes;
                        };

                        return (
                            <div key={key} className={styles.groupRow}>
                                <span className={styles.groupTitle}>
                                    {level === 0 ? T('sort.groupBy') : T('sort.thenBy')}
                                </span>

                                <div className={styles.pills}>
                                    <button
                                        type="button"
                                        onClick={() => apply(clearFrom())}
                                        data-active={!current}
                                        className={styles.pill}
                                    >
                                        {T('sort.none')}
                                    </button>
                                    {TAG_OPTIONS.filter((option) => !used.includes(option.id)).map(
                                        (option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => apply({ [key]: option.id })}
                                                data-active={option.id === current}
                                                className={styles.pill}
                                            >
                                                {option.label.toLowerCase()}
                                            </button>
                                        ),
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

//one sorting level: a field, a direction and its own filter
function Level({
    slot,
    position,
    facets,
    apply,
    onRemove,
    canRemove,
    open,
    onToggleOpen,
    tags,
    tagOptions: options,
    T,
}) {
    //type chips get their colour from the label, so the map follows the language
    const colors = typeColors(useLang());
    const tag = tags[slot.tag];
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
                    title={T('sort.showFilter')}
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
                        {options.map((option) => (
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
                    title={slot.direction === 'asc' ? T('sort.ascending') : T('sort.descending')}
                >
                    {slot.direction === 'asc' ? '↑' : '↓'}
                </button>

                {chosen > 0 && (
                    <span className={styles.levelTag}>
                        {slot.filterMode === 'exclude'
                            ? T('sort.excluded', { n: chosen })
                            : T('sort.kept', { n: chosen })}
                    </span>
                )}

                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className={styles.levelRemove}
                        title={T('sort.removeLevel')}
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
                                    {slot.filterMode === 'exclude' ? T('sort.leaveOut') : T('sort.keepOnly')}
                                </span>

                                <div className={styles.modeToggle}>
                                    <button
                                        type="button"
                                        onClick={() => apply({ [slot.keys.fmode]: null })}
                                        data-active={slot.filterMode === 'keep'}
                                        className={styles.modeButton}
                                    >
                                        {T('sort.keep')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => apply({ [slot.keys.fmode]: 'exclude' })}
                                        data-active={slot.filterMode === 'exclude'}
                                        className={styles.modeButton}
                                    >
                                        {T('sort.exclude')}
                                    </button>
                                </div>
                            </div>

                            {facets.length === 0 ? (
                                <p className={styles.note}>{T('sort.noValues')}</p>
                            ) : (
                                <div className={styles.values}>
                                    {facets.map((facet) => {
                                        const on = slot.filterValues.includes(facet.value);
                                        const dot = colors[facet.value];

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
                        <p className={styles.note}>{T('sort.orderOnly', { label: tag.label })}</p>
                    )}
                </div>
            )}
        </div>
    );
}

//one line describing the whole panel while it is folded away
function summarize(levels, groups, tags, T) {
    const order = levels
        .map((slot) => `${tags[slot.tag].label} ${slot.direction === 'asc' ? '↑' : '↓'}`)
        .join(' → ');

    const grouped = groups.length
        ? T('sort.groupedBy', {
              levels: groups.map((id) => tags[id].label.toLowerCase()).join(' › '),
          })
        : '';
    return `${order}${grouped}`;
}
