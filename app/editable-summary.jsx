'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './editable-summary.module.css';

//an editable multi-line summary
//click the text to edit, Ctrl/Cmd+Enter or blur saves, Escape cancels
export default function EditableSummary({ meetingId, value }) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(value);
    const [busy, setBusy] = useState(false);
    const areaRef = useRef(null);

    //fill and focus the textarea when editing starts
    useEffect(() => {
        if (editing) {
            setText(value);
            areaRef.current?.focus();
        }
    }, [editing, value]);

    async function save() {
        const next = text.trim();
        setEditing(false);

        //nothing changed, no request
        if (next === (value ?? '')) return;

        setBusy(true);
        try {
            await fetch(`/api/meetings/${meetingId}/summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ summary: next }),
            });
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(event) {
        //Ctrl/Cmd+Enter saves, Escape drops the edit
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            save();
        } else if (event.key === 'Escape') {
            setEditing(false);
        }
    }

    if (editing) {
        return (
            <div className={styles.wrap}>
                <textarea
                    ref={areaRef}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={save}
                    disabled={busy}
                    rows={5}
                    className={styles.input}
                />
                <p className={styles.hint}>Ctrl+Enter to save · Esc to cancel</p>
            </div>
        );
    }

    return (
        <button type="button" onClick={() => setEditing(true)} className={styles.text}>
            {value ? value : <span className={styles.empty}>Add a summary…</span>}
            <span className={styles.pencil} title="Edit">
                ✎
            </span>
        </button>
    );
}
