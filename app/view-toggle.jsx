'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import styles from './view-toggle.module.css';

//Переключатель «таблица ⇄ карточки». Режим живёт в ?view (пусто = таблица),
//как и остальное состояние списка, — поэтому вид делится ссылкой и попадает
//в сохранённые виды заодно со всем прочим.
export default function ViewToggle() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const cards = searchParams.get('view') === 'cards';

    function set(mode) {
        const next = new URLSearchParams(searchParams.toString());
        if (mode === 'cards') next.set('view', 'cards');
        else next.delete('view');
        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    return (
        <span className={styles.box} role="group" aria-label={T('view.toggle')}>
            <button
                type="button"
                className={styles.btn}
                data-active={!cards}
                aria-pressed={!cards}
                onClick={() => set('table')}
            >
                {T('view.table')}
            </button>
            <button
                type="button"
                className={styles.btn}
                data-active={cards}
                aria-pressed={cards}
                onClick={() => set('cards')}
            >
                {T('view.cards')}
            </button>
        </span>
    );
}
