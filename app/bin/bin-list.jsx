'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './bin.module.css';

//Список архивных встреч с восстановлением по строке. Состояние — только на
//время нажатия: убранная строка исчезает сразу (оптимистично), а router.refresh
//пересобирает серверные данные, чтобы дашборд и счётчики сошлись. Настоящего
//удаления здесь нет по решению: корзина = архив, из неё только возвращают.
export default function BinList({ rows: initial, words }) {
    const router = useRouter();
    const [rows, setRows] = useState(initial);
    const [busy, setBusy] = useState(null);
    const [note, setNote] = useState('');

    async function restore(id) {
        setBusy(id);
        setNote('');
        try {
            const res = await fetch('/api/meetings/bulk', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ids: [id], set: { archived: false } }),
            });
            if (!res.ok) throw new Error('restore failed');
            setRows((current) => current.filter((row) => row.id !== id));
            setNote(words.restored);
            router.refresh();
        } catch {
            setNote(words.failed);
        } finally {
            setBusy(null);
        }
    }

    if (!rows.length) return <p className={styles.empty}>{words.empty}</p>;

    return (
        <>
            {note && (
                <p className={styles.note} role="status">
                    {note}
                </p>
            )}
            <ul className={styles.list}>
                {rows.map((row) => (
                    <li key={row.id} className={styles.row}>
                        <div className={styles.info}>
                            <span className={styles.name}>{row.title}</span>
                            <span className={styles.meta}>
                                {row.when && <span>{row.when}</span>}
                                {row.types.map((type) => (
                                    <span key={type.key} className={styles.type} data-type={type.key}>
                                        {type.label}
                                    </span>
                                ))}
                            </span>
                        </div>
                        <button
                            type="button"
                            className={styles.restore}
                            disabled={busy === row.id}
                            onClick={() => restore(row.id)}
                        >
                            {busy === row.id ? words.restoring : words.restore}
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
}
