'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from './lang-context';
import { isTyping } from '@/lib/keys';
import styles from './command-palette.module.css';

//Командная палитра (⌘K / Ctrl+K) — быстрый прыжок по разделам и по встречам,
//поверх обычного поиска. Живые совпадения по встречам тянутся из
///api/meetings/search (тот же серверный поиск, что и поле «/»), выбор ведёт
//прямо на страницу встречи. Само тяжёлое сопоставление живёт на сервере —
//здесь только список и клавиши.

//разделы, на которые ведёт палитра. Подписи переиспользуют ключи навигации,
//чтобы палитра и шапка звали одно и то же одинаково.
const NAV = [
    { key: 'home', href: '/', label: 'palette.home' },
    { key: 'people', href: '/people', label: 'nav.people' },
    { key: 'records', href: '/records', label: 'nav.records' },
    { key: 'bin', href: '/bin', label: 'bin.nav' },
    { key: 'settings', href: '/settings', label: 'nav.settings' },
    { key: 'connect', href: '/connect', label: 'nav.connect' },
];

export default function CommandPalette() {
    const router = useRouter();
    const T = useT();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [hits, setHits] = useState([]);
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);

    const close = useCallback(() => {
        setOpen(false);
        setQ('');
        setHits([]);
        setActive(0);
    }, []);

    //⌘K / Ctrl+K открывает и закрывает палитру откуда угодно. Escape закрывает,
    //и только палитру — capture-фаза, чтобы список под ней не принял Escape на
    //свой счёт (RowNav тоже слушает Escape). "?" и "/" остаются за их хозяевами.
    useEffect(() => {
        function onKey(event) {
            const k = event.key.toLowerCase();
            if (k === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey) {
                event.preventDefault();
                setOpen((v) => !v);
                return;
            }
            if (open && event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        }
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open, close]);

    //фокус в поле, как только палитра открылась
    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    //живой поиск встреч: дебаунс, чтобы не бить по серверу на каждую букву;
    //ниже двух знаков не ищем — так же, как решает сам searchMeetingIds.
    //Флаг alive гасит ответ на устаревший запрос, если пока он летел, текст
    //успел смениться.
    useEffect(() => {
        const term = q.trim();
        let alive = true;
        //весь setState уходит внутрь таймера (асинхронно) — синхронно менять
        //состояние в теле эффекта не нужно и линтер справедливо это ловит
        const id = setTimeout(() => {
            if (term.length < 2) {
                if (alive) setHits([]);
                return;
            }
            fetch(`/api/meetings/search?q=${encodeURIComponent(term)}`)
                .then((r) => (r.ok ? r.json() : { results: [] }))
                .then((body) => {
                    if (alive) setHits(Array.isArray(body.results) ? body.results : []);
                })
                .catch(() => {
                    if (alive) setHits([]);
                });
        }, 220);
        return () => {
            alive = false;
            clearTimeout(id);
        };
    }, [q]);

    //единый плоский список того, по чему бегают стрелки: разделы, затем строка
    //«искать в таблице», затем найденные встречи. У каждого пункта — куда вести.
    const items = useMemo(() => {
        const term = q.trim();
        const needle = term.toLowerCase();
        const nav = NAV
            .map((n) => ({ ...n, text: T(n.label) }))
            .filter((n) => !needle || n.text.toLowerCase().includes(needle))
            .map((n) => ({ id: `nav:${n.key}`, group: 'action', text: n.text, meta: '', href: n.href }));

        const search = term
            ? [{
                id: 'search',
                group: 'action',
                text: T('palette.searchFor').replace('{q}', term),
                meta: '',
                href: `/?q=${encodeURIComponent(term)}`,
            }]
            : [];

        const meetings = hits.map((h) => ({
            id: `meeting:${h.id}`,
            group: 'meeting',
            text: h.title,
            meta: h.date || '',
            href: `/meetings/${h.id}`,
        }));

        return [...nav, ...search, ...meetings];
    }, [q, hits, T]);

    //активный пункт не должен убежать за пределы списка, когда список сжался:
    //зажимаем на отрисовке, а не отдельным эффектом с setState
    const activeIndex = items.length ? Math.min(active, items.length - 1) : 0;

    const run = useCallback((item) => {
        if (!item) return;
        close();
        router.push(item.href);
    }, [close, router]);

    if (!open) return null;

    //стрелки и Enter живут на самом поле: оно в фокусе, и здесь под рукой
    //актуальный items без гонок замыкания
    function onInputKey(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            run(items[activeIndex]);
        }
    }

    //куда вставлять заголовок раздела — перед первым пунктом каждой группы
    let lastGroup = null;

    return (
        <div className={styles.backdrop} onMouseDown={close} role="dialog" aria-modal="true" aria-label={T('palette.title')}>
            <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    className={styles.input}
                    type="text"
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setActive(0); }}
                    onKeyDown={onInputKey}
                    placeholder={T('palette.placeholder')}
                    aria-label={T('palette.placeholder')}
                />

                {items.length === 0 ? (
                    <p className={styles.empty}>{T('palette.empty')}</p>
                ) : (
                    <ul className={styles.list} role="listbox">
                        {items.map((item, i) => {
                            const header = item.group !== lastGroup ? item.group : null;
                            lastGroup = item.group;
                            return (
                                <li key={item.id} className={styles.group}>
                                    {header && (
                                        <span className={styles.section}>
                                            {T(header === 'meeting' ? 'palette.meetings' : 'palette.actions')}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={i === activeIndex}
                                        className={styles.row}
                                        data-active={i === activeIndex}
                                        onMouseMove={() => setActive(i)}
                                        onClick={() => run(item)}
                                    >
                                        <span className={styles.rowText}>{item.text}</span>
                                        {item.meta && <span className={styles.rowMeta}>{item.meta}</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className={styles.footer}>
                    <span><kbd className={styles.kbd}>↑</kbd><kbd className={styles.kbd}>↓</kbd> {T('palette.footMove')}</span>
                    <span><kbd className={styles.kbd}>↵</kbd> {T('palette.footOpen')}</span>
                    <span><kbd className={styles.kbd}>Esc</kbd> {T('palette.footClose')}</span>
                </div>
            </div>
        </div>
    );
}
