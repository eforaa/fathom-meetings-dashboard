'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelection } from './selection';
import { useDeferredRefresh } from './refresh';
import styles from './bulk-bar.module.css';

//Панель действий над пачкой.
//
//Появляется, когда отмечена хотя бы одна встреча, и живёт внизу окна, а не в
//потоке страницы: список длинный, и панель, уехавшая вверх вместе с ним,
//заставляла бы прокручивать список обратно ради кнопки.
//
//Про «9 из 12». Разделение на изменённые и те, у которых значение и так стояло,
//делает сервер — только он знает нынешние значения. Страница ничего не
//угадывает, она показывает три списка, которые ей прислали.

const TOAST_MS = 8000;

export default function BulkBar({ types, typesById, words }) {
    const { count, ids, clear } = useSelection();
    const [refreshLater] = useDeferredRefresh();

    const [busy, setBusy] = useState(false);
    const [menu, setMenu] = useState(null);
    const [result, setResult] = useState(null);
    const lastRequest = useRef(null);
    const timer = useRef(null);

    //плашка результата живёт восемь секунд. Дольше — она начинает мешать,
    //короче — её не успевают прочитать
    useEffect(() => {
        if (!result) return undefined;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setResult(null), TOAST_MS);
        return () => clearTimeout(timer.current);
    }, [result]);

    //пока панель поднята, таблица получает пустоту в подвале: иначе последняя
    //строка списка оказывается под ней и до неё не добраться прокруткой
    useEffect(() => {
        if (!count && !result) return undefined;
        document.body.dataset.bulk = 'on';
        return () => { delete document.body.dataset.bulk; };
    }, [count, result]);

    //панель и меню закрываются по Escape; отметку снимает список
    useEffect(() => {
        if (!menu) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') setMenu(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menu]);

    if (!count && !result) return null;

    async function send(payload, describe) {
        setBusy(true);
        setMenu(null);
        lastRequest.current = { payload, describe };

        try {
            const response = await fetch('/api/meetings/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error(String(response.status));

            const answer = await response.json();
            setResult({ ...answer, describe });
            //отметка снимается только после ответа: до него человек ещё может
            //захотеть повторить то же самое по той же пачке
            clear();
            refreshLater();
        } catch {
            //отметка остаётся: собирать двенадцать строк заново дороже, чем
            //нажать «повторить»
            setResult({ error: true, describe });
        } finally {
            setBusy(false);
        }
    }

    const applyTypes = (type) =>
        send(
            { ids, set: { types: type ? [type] : [] } },
            type
                ? words.doneType.replace('{type}', types.find((t) => t.key === type)?.label ?? '')
                : words.doneTypeCleared,
        );

    const applyImportance = (value) =>
        send({ ids, set: { importance: value } }, value ? words.donePriority.replace('{n}', value) : words.donePriorityCleared);

    const undo = () => {
        if (!result?.previous?.length) return;
        send({ restore: result.previous }, words.undone);
    };

    const retry = () => {
        const again = lastRequest.current;
        if (again) send(again.payload, again.describe);
    };

    //сколько отмеченных встреч уже несут этот тип — счётчик рядом с пунктом
    //меню, чтобы «задать тип» не выглядело действием вслепую
    const countWith = (key) => ids.filter((id) => (typesById?.[id] ?? []).includes(key)).length;

    //--- плашка результата ---------------------------------------------------
    if (result) {
        const partial = !result.error && (result.unchanged?.length || result.failed?.length);

        return (
            <div className={styles.dock}>
                <div
                    className={styles.toast}
                    data-kind={result.error ? 'error' : partial ? 'partial' : 'done'}
                    role="status"
                    aria-live="polite"
                >
                    <div className={styles.toastText}>
                        <span className={styles.toastTitle}>
                            {result.error
                                ? words.failed
                                : partial
                                    ? words.partial
                                        .replace('{done}', result.changed?.length ?? 0)
                                        .replace('{total}',
                                            (result.changed?.length ?? 0)
                                            + (result.unchanged?.length ?? 0)
                                            + (result.failed?.length ?? 0))
                                    : `${result.describe} — ${result.changed?.length ?? 0}`}
                        </span>
                        <span className={styles.toastNote}>
                            {result.error ? words.failedNote : words.doneNote}
                        </span>
                    </div>

                    {result.error ? (
                        <button type="button" className={styles.action} onClick={retry}>
                            {words.retry}
                        </button>
                    ) : result.previous?.length ? (
                        <button type="button" className={styles.action} onClick={undo}>
                            {words.undo}
                            <span className={styles.hint}>⌘Z</span>
                        </button>
                    ) : null}
                </div>
            </div>
        );
    }

    //--- сама панель ---------------------------------------------------------
    return (
        <div className={styles.dock}>
            <div className={styles.bar} data-busy={busy ? 'true' : undefined}>
                <span className={styles.countBox}>
                    <span className={styles.countLabel}>{busy ? words.applying : words.selected}</span>
                    <span className={styles.countValue}>{count}</span>
                </span>

                <span className={styles.divider} aria-hidden="true" />

                <span className={styles.menuBox}>
                    <button
                        type="button"
                        className={styles.action}
                        disabled={busy}
                        aria-expanded={menu === 'type'}
                        aria-haspopup="menu"
                        onClick={() => setMenu(menu === 'type' ? null : 'type')}
                    >
                        <span className={styles.long}>{words.setType}</span>
                        <span className={styles.short}>{words.shortType}</span>
                        <span aria-hidden="true">▾</span>
                    </button>

                    {menu === 'type' && (
                        <div className={styles.menu} role="menu">
                            {types.map((type) => (
                                <button
                                    key={type.key}
                                    type="button"
                                    role="menuitem"
                                    className={styles.item}
                                    onClick={() => applyTypes(type.key)}
                                >
                                    <span className={styles.dot} data-type={type.key} />
                                    {type.label}
                                    <span className={styles.itemCount}>{countWith(type.key)}</span>
                                </button>
                            ))}
                            <button
                                type="button"
                                role="menuitem"
                                className={styles.item}
                                onClick={() => applyTypes(null)}
                            >
                                {words.clearType}
                            </button>
                        </div>
                    )}
                </span>

                <span className={styles.menuBox}>
                    <button
                        type="button"
                        className={styles.action}
                        disabled={busy}
                        aria-expanded={menu === 'priority'}
                        aria-haspopup="menu"
                        onClick={() => setMenu(menu === 'priority' ? null : 'priority')}
                    >
                        <span className={styles.long}>{words.setPriority}</span>
                        <span className={styles.short}>{words.shortPriority}</span>
                        <span aria-hidden="true">▾</span>
                    </button>

                    {menu === 'priority' && (
                        <div className={styles.menu} role="menu">
                            {[5, 4, 3, 2, 1].map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="menuitem"
                                    className={styles.item}
                                    onClick={() => applyImportance(value)}
                                >
                                    {'★'.repeat(value)}
                                    <span className={styles.itemCount}>{value}</span>
                                </button>
                            ))}
                            <button
                                type="button"
                                role="menuitem"
                                className={styles.item}
                                onClick={() => applyImportance(0)}
                            >
                                {words.clearPriority}
                            </button>
                        </div>
                    )}
                </span>

                <span className={styles.divider} aria-hidden="true" />

                <button type="button" className={styles.action} disabled={busy} onClick={clear}>
                    {words.clear}
                    <span className={styles.hint}>Esc</span>
                </button>
            </div>
        </div>
    );
}
