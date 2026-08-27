'use client';

import { useEffect, useRef, useState } from 'react';
import { isTyping, opensHelp } from '@/lib/keys';
import { useT } from './lang-context';
import styles from './shortcuts-help.module.css';

//Список сочетаний клавиш по «?».
//
//Самая дешёвая правка из всех, что можно сделать с этим списком, и самая
//недооценённая: половина функций страницы управляется с клавиатуры, и до
//сих пор об этом знал только тот, кто читал исходники. Функция, о которой
//никто не знает, ничем не отличается от отсутствующей.
//
//Открывается по «?» — там же, где её открывают почта, GitHub и все остальные
//списки. Закрывается по Escape, по щелчку мимо и по кнопке: человек, который
//нажал «?» случайно, не должен искать выход.

//пары «клавиши — что делают». Слова живут в словаре, здесь только порядок
const ROWS = [
    { keys: ['j', 'k'], word: 'help.move' },
    { keys: ['↑', '↓'], word: 'help.moveArrows' },
    { keys: ['Enter'], word: 'help.open' },
    { keys: ['/'], word: 'help.search' },
    { keys: ['x'], word: 'help.mark' },
    { keys: ['Shift', 'X'], word: 'help.markRange' },
    { keys: ['a'], word: 'help.markAll' },
    { keys: ['Esc'], word: 'help.escape' },
    { keys: ['?'], word: 'help.help' },
];

export default function ShortcutsHelp() {
    const T = useT();
    const [open, setOpen] = useState(false);
    const closeRef = useRef(null);
    //куда вернуть фокус: человек нажал «?» посреди работы и должен вернуться
    //ровно туда, где был
    const cameFrom = useRef(null);

    useEffect(() => {
        function onKey(event) {
            const target = event.target;
            const typing = isTyping(target?.tagName, target?.isContentEditable);

            if (opensHelp(event.key, typing)) {
                event.preventDefault();
                cameFrom.current = document.activeElement;
                setOpen(true);
                return;
            }

            //Escape здесь важнее списка: пока открыта подсказка, она и
            //закрывается, а отметка строк остаётся нетронутой
            if (open && event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
            }
        }

        //capture: перехватываем Escape раньше списка, который иначе снял бы
        //отметку заодно с закрытием окна
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open]);

    useEffect(() => {
        if (open) closeRef.current?.focus();
        else cameFrom.current?.focus?.();
    }, [open]);

    if (!open) return null;

    return (
        <div
            className={styles.veil}
            onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
            <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={T('help.title')}>
                <div className={styles.head}>
                    <h2 className={styles.title}>{T('help.title')}</h2>
                    <button
                        type="button"
                        ref={closeRef}
                        className={styles.close}
                        onClick={() => setOpen(false)}
                        aria-label={T('help.close')}
                    >
                        ✕
                    </button>
                </div>

                <dl className={styles.rows}>
                    {ROWS.map((row) => (
                        <div key={row.word} className={styles.row}>
                            <dt className={styles.keys}>
                                {row.keys.map((key) => (
                                    <kbd key={key} className={styles.key}>{key}</kbd>
                                ))}
                            </dt>
                            <dd className={styles.what}>{T(row.word)}</dd>
                        </div>
                    ))}
                </dl>

                <p className={styles.note}>{T('help.note')}</p>
            </div>
        </div>
    );
}
