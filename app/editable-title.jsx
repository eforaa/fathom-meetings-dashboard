'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from './lang-context';
import styles from './editable-title.module.css';
import { useDeferredRefresh } from './refresh';

//an editable meeting title
//variant "row": a link with a pencil that appears on hover
//variant "title": a big heading, click the pencil to rename
export default function EditableTitle({ meetingId, value, href, variant = 'row', source }) {
    const T = useT();
    //a small text badge so a generated name is recognisable at a glance
    const mark =
        source === 'ai_title' ? (
            <span className={styles.aiBadge} title="Сгенерировано Клодом">
                AI
            </span>
        ) : null;
    const [refreshLater] = useDeferredRefresh();
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(value);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);

    //put the cursor in the input once it exists. the draft itself is filled
    //when editing starts — setting state from an effect makes React render
    //twice and, with a stale value in between, flash the old name
    useEffect(() => {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    function startEditing() {
        setText(value);
        setEditing(true);
    }

    async function save() {
        const next = text.trim();
        setEditing(false);

        //nothing changed, no request
        if (next === value || (!next && value === '')) return;

        setBusy(true);
        try {
            await fetch(`/api/meetings/${meetingId}/title`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: next }),
            });
            refreshLater();
        } finally {
            setBusy(false);
        }
    }

    //Enter saves, Escape drops the edit
    function onKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            save();
        } else if (event.key === 'Escape') {
            setEditing(false);
        }
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKeyDown}
                onBlur={save}
                disabled={busy}
                className={variant === 'title' ? styles.inputTitle : styles.inputRow}
            />
        );
    }

    //the pencil starts editing without following the link
    const pencil = (
        <button
            type="button"
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startEditing();
            }}
            className={styles.pencil}
            title={T('row.rename')}
            aria-label={T('row.rename')}
        >
            ✎
        </button>
    );

    if (variant === 'title') {
        return (
            <span className={styles.titleWrap}>
                {mark}
                <span className={styles.heading}>{value || 'Untitled'}</span>
                {pencil}
            </span>
        );
    }

    return (
        <span className={styles.rowWrap}>
            {mark}
            <Link href={href} className={styles.link}>
                {value || T('row.untitled')}
            </Link>
            {pencil}
        </span>
    );
}
