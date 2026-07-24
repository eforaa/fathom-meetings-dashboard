'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './custom-cell.module.css';

//one editable custom-column cell in a meeting row
//how it looks depends on the column type
export default function CustomCell({ meetingId, column, value }) {
    const router = useRouter();
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
            router.refresh();
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
