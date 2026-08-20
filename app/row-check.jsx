'use client';

import { useSelection } from './selection';
import styles from './row-check.module.css';

//Галочка строки и галочка шапки.
//
//Видны всегда, а не при наведении. Наведение — жест мыши, а разбирать список
//пачками приходится и с клавиатуры; к тому же галочка, которой не видно, не
//сообщает, что отметка вообще возможна, — а это здесь основная работа.
//
//Щелчок по галочке не должен доходить до строки: строка целиком ведёт на
//встречу, и человек, отмечающий двенадцать штук подряд, не ожидает уехать со
//страницы на первой же.

function Mark({ state }) {
    //«частично» — короткая черта, «всё» — галочка. Знак, а не только цвет:
    //разница между «часть» и «все» слишком важна, чтобы жить в оттенке
    if (state === 'some') {
        return (
            <svg viewBox="0 0 10 10" aria-hidden="true" className={styles.mark}>
                <path d="M2 5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 10 10" aria-hidden="true" className={styles.mark}>
            <path
                d="M2 5.2l2 2L8 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function RowCheck({ id, label }) {
    const { has, toggle, toggleRange, applying } = useSelection();
    const checked = has(id);
    //пока идёт запись — только галочка меняет вид. Строка не гаснет: текст в
    //ней читают и в этот момент, а приглушённая строка выглядит недоступной,
    //хотя недоступна она ровно на полсекунды
    const busy = applying && checked;

    function onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        //Shift и мышью тоже: тот же жест, что Shift+X с клавиатуры
        if (event.shiftKey) toggleRange(id);
        else toggle(id);
    }

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={label}
            className={styles.check}
            data-checked={checked ? 'true' : undefined}
            data-busy={busy ? 'true' : undefined}
            disabled={busy}
            onClick={onClick}
        >
            {checked && <Mark state="all" />}
        </button>
    );
}

export function SelectAllCheck({ label }) {
    const { state, selectAll, clear } = useSelection();

    function onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        //частично отмечено — нажатие берёт всё; всё отмечено — снимает
        if (state === 'all') clear();
        else selectAll();
    }

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false'}
            aria-label={label}
            className={styles.check}
            data-checked={state === 'none' ? undefined : 'true'}
            onClick={onClick}
        >
            {state !== 'none' && <Mark state={state} />}
        </button>
    );
}
