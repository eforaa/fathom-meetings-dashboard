'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from './lang-context';
import styles from './custom-cell.module.css';
import { useDeferredRefresh } from './refresh';

//one editable custom-column cell in a meeting row
//how it looks depends on the column type
export default function CustomCell({ meetingId, column, value }) {
    //tags column has its own multi-select editor (its own hooks)
    if (column.type === 'multiselect') {
        return <MultiCell meetingId={meetingId} column={column} value={value} />;
    }

    return <SingleCell meetingId={meetingId} column={column} value={value} />;
}

//text / number / select / checkbox — one value per cell
function SingleCell({ meetingId, column, value }) {
    const [refreshLater] = useDeferredRefresh();
    const [current, setCurrent] = useState(value ?? '');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);

    async function save(next) {
        setBusy(true);
        try {
            await fetch(`/api/meetings/${meetingId}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ columnId: column.id, value: next }),
            });
            refreshLater();
        } finally {
            setBusy(false);
            setEditing(false);
        }
    }

    //checkbox toggles in place, no editing state
    if (column.type === 'checkbox') {
        return (
            <button
                type="button"
                onClick={() => save(current === true ? '' : true)}
                disabled={busy}
                className={styles.box}
                data-on={current === true}
                aria-label={column.name}
            >
                {current === true && '✓'}
            </button>
        );
    }

    //choice column is a small dropdown
    if (column.type === 'select') {
        return (
            <select
                value={current ?? ''}
                onChange={(event) => {
                    setCurrent(event.target.value);
                    save(event.target.value);
                }}
                disabled={busy}
                className={styles.select}
            >
                <option value="">—</option>
                {(column.options ?? []).map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        );
    }

    //text and number: show the value, click to edit
    if (editing) {
        return (
            <input
                type={column.type === 'number' ? 'number' : 'text'}
                defaultValue={current ?? ''}
                autoFocus
                disabled={busy}
                onBlur={(event) => save(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') save(event.target.value);
                    else if (event.key === 'Escape') setEditing(false);
                }}
                className={styles.input}
            />
        );
    }

    return (
        <button type="button" onClick={() => setEditing(true)} className={styles.text}>
            {current === '' || current === null || current === undefined ? (
                <span className={styles.empty}>—</span>
            ) : (
                current
            )}
        </button>
    );
}

//tags column: pick several allowed values into one cell
function MultiCell({ meetingId, column, value }) {
    const T = useT();
    const [refreshLater] = useDeferredRefresh();
    const [selected, setSelected] = useState(Array.isArray(value) ? value : []);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const boxRef = useRef(null);

    //close the panel on outside click or Escape
    useEffect(() => {
        if (!open) return undefined;

        const handleClick = (event) => {
            if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
        };
        const handleKey = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);

        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    async function toggle(option) {
        if (busy) return;

        const on = selected.includes(option);
        const next = on ? selected.filter((item) => item !== option) : [...selected, option];
        const previous = selected;

        setSelected(next);
        setBusy(true);

        try {
            await fetch(`/api/meetings/${meetingId}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ columnId: column.id, value: next }),
            });
            refreshLater();
        } catch {
            //put the old set back if the request failed
            setSelected(previous);
        } finally {
            setBusy(false);
        }
    }

    const options = column.options ?? [];

    return (
        <div className={styles.multi} ref={boxRef}>
            <button type="button" onClick={() => setOpen(!open)} className={styles.multiTrigger}>
                {selected.length ? (
                    <span className={styles.tags}>
                        {selected.map((tag) => (
                            <span key={tag} className={styles.tag}>
                                {tag}
                            </span>
                        ))}
                    </span>
                ) : (
                    <span className={styles.empty}>—</span>
                )}
            </button>

            {open && (
                <div className={styles.multiPanel}>
                    {options.length === 0 ? (
                        <p className={styles.multiHint}>{T('cell.noOptions')}</p>
                    ) : (
                        options.map((option) => {
                            const on = selected.includes(option);

                            return (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => toggle(option)}
                                    disabled={busy}
                                    data-active={on}
                                    className={styles.multiOption}
                                >
                                    <span className={styles.multiBox} data-on={on}>
                                        {on && '✓'}
                                    </span>
                                    {option}
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
