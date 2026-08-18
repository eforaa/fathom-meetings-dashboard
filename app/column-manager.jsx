'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLUMN_TYPES, OPTION_TYPES } from '@/lib/column-types';
import { useT } from './lang-context';
import styles from './column-manager.module.css';

//the "+ column" control and its small add form
export default function ColumnManager() {
    const T = useT();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('text');
    const [options, setOptions] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function add() {
        setBusy(true);
        setError(null);

        try {
            const response = await fetch('/api/columns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    type,
                    //choice / tags values are typed one per comma
                    options: OPTION_TYPES.includes(type) ? options.split(',') : undefined,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) throw new Error(data.error ?? 'Could not add');

            //reset and close
            setName('');
            setOptions('');
            setType('text');
            setOpen(false);
            router.refresh();
        } catch (caught) {
            setError(caught.message);
        } finally {
            setBusy(false);
        }
    }

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className={styles.add}>
                + column
            </button>
        );
    }

    return (
        <div className={styles.form}>
            <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={T('column.namePlaceholder')}
                className={styles.name}
                autoFocus
            />

            <select
                value={type}
                onChange={(event) => setType(event.target.value)}
                className={styles.type}
            >
                {COLUMN_TYPES.map((option) => (
                    <option key={option} value={option}>
                        {T(`columnType.${option}`)}
                    </option>
                ))}
            </select>

            {OPTION_TYPES.includes(type) && (
                <input
                    value={options}
                    onChange={(event) => setOptions(event.target.value)}
                    placeholder={T('column.valuesPlaceholder')}
                    className={styles.options}
                />
            )}

            <button
                type="button"
                onClick={add}
                disabled={busy || !name.trim()}
                className={styles.save}
            >
                {busy ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={styles.cancel}>
                {T('common.cancel')}
            </button>

            {error && <span className={styles.error}>{error}</span>}
        </div>
    );
}

//a column header with a remove button, one per custom column
export function ColumnHeader({ column }) {
    const T = useT();
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function remove() {
        setBusy(true);
        try {
            await fetch(`/api/columns/${column.id}`, { method: 'DELETE' });
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <span className={styles.header}>
            {column.name}
            <button
                type="button"
                onClick={remove}
                disabled={busy}
                className={styles.remove}
                title={T('column.remove')}
            >
                ×
            </button>
        </span>
    );
}
