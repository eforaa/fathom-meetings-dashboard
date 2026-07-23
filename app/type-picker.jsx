'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MEETING_TYPES } from '@/lib/ai';
import { typeLabel, MAX_TYPES } from '@/lib/format';
import styles from './type-picker.module.css';

//picking up to MAX_TYPES types for one meeting
export default function TypePicker({ meetingId, value = [] }) {
    const router = useRouter();
    const [types, setTypes] = useState(value);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const boxRef = useRef(null);

    //closing the panel on outside click or Escape
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

    async function toggle(type) {
        if (busy) return;

        const on = types.includes(type);
        //the cap only blocks adding, removing always works
        if (!on && types.length >= MAX_TYPES) return;

        const next = on ? types.filter((item) => item !== type) : [...types, type];
        const previous = types;

        setTypes(next);
        setBusy(true);

        try {
            await fetch(`/api/meetings/${meetingId}/types`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ types: next }),
            });
            router.refresh();
        } catch {
            //put the old set back if the request failed
            setTypes(previous);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={styles.picker} ref={boxRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={styles.trigger}
            >
                {types.length ? (
                    <span className={styles.chips}>
                        {types.map((type) => (
                            <span key={type} className={styles.chip}>
                                {typeLabel(type)}
                            </span>
                        ))}
                    </span>
                ) : (
                    <span className={styles.placeholder}>Set type</span>
                )}
            </button>

            {open && (
                <div className={styles.panel}>
                    {MEETING_TYPES.map((type) => {
                        const on = types.includes(type);
                        //greyed out once the cap is reached
                        const blocked = !on && types.length >= MAX_TYPES;

                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => toggle(type)}
                                disabled={blocked}
                                data-active={on}
                                className={styles.option}
                            >
                                <span className={`${styles.box} ${on ? styles.boxOn : ''}`} />
                                {typeLabel(type)}
                            </button>
                        );
                    })}

                    <p className={styles.hint}>Up to {MAX_TYPES} types</p>
                </div>
            )}
        </div>
    );
}
