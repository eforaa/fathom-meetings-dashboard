'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './stars.module.css';

//editable 1..5 star rating
//clicking a star sets it, clicking the same star again clears the rating
export default function Stars({ meetingId, value = 0 }) {
    const router = useRouter();
    const [current, setCurrent] = useState(value);
    const [hover, setHover] = useState(0);
    const [busy, setBusy] = useState(false);

    async function set(rating, event) {
        //the row and the card are links, the star must not navigate
        event.preventDefault();
        event.stopPropagation();
        if (busy) return;

        //same star again means "unrate"
        const next = rating === current ? 0 : rating;
        setCurrent(next);
        setBusy(true);

        try {
            await fetch(`/api/meetings/${meetingId}/importance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ importance: next }),
            });
            router.refresh();
        } catch {
            //put the old value back if the request failed
            setCurrent(current);
        } finally {
            setBusy(false);
        }
    }

    //hover preview wins over the saved value
    const shown = hover || current;

    return (
        <span className={styles.stars} onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    className={styles.star}
                    data-on={n <= shown}
                    onMouseEnter={() => setHover(n)}
                    onClick={(event) => set(n, event)}
                    aria-label={`${n} of 5`}
                >
                    ★
                </button>
            ))}
        </span>
    );
}
