'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './meeting-editor.module.css';

//one pencil that edits title and summary together
export default function MeetingEditor({
    meetingId,
    title,
    originalTitle,
    summary,
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ title, summary });

    function start() {
        setForm({ title, summary });
        setEditing(true);
    }

    async function save() {
        setBusy(true);
        try {
            await fetch(`/api/meetings/${meetingId}/edit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            router.refresh();
            setEditing(false);
        } finally {
            setBusy(false);
        }
    }

    function set(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    if (editing) {
        return (
            <div className={styles.editor}>
                <input
                    value={form.title}
                    onChange={(event) => set('title', event.target.value)}
                    placeholder="Title"
                    className={styles.titleInput}
                    autoFocus
                />

                <label className={styles.label}>Summary</label>
                <textarea
                    value={form.summary}
                    onChange={(event) => set('summary', event.target.value)}
                    placeholder="Summary"
                    rows={4}
                    className={styles.area}
                />

                <div className={styles.actions}>
                    <button type="button" onClick={save} disabled={busy} className={styles.save}>
                        {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className={styles.cancel}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.view}>
            <div className={styles.titleRow}>
                <h1 className={styles.title}>{title || 'Untitled'}</h1>
                <button
                    type="button"
                    onClick={start}
                    className={styles.pencil}
                    title="Edit title and summary"
                    aria-label="Edit"
                >
                    ✎
                </button>
            </div>

            {originalTitle && title !== originalTitle && (
                <p className={styles.original}>Recorded as “{originalTitle}”</p>
            )}

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Summary</h2>
                {summary ? (
                    <p className={styles.body}>{summary}</p>
                ) : (
                    <p className={styles.empty}>No summary yet</p>
                )}
            </section>
        </div>
    );
}
