'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import { usePanelFit } from './use-panel-fit';
import styles from './gaps-menu.module.css';

//Пробелы в данных — одной кнопкой вместо четырёх.
//
//Четыре кнопки «без назви», «без конспекту», «без типу», «без оцінки»
//занимали в ряду 452 пикселя. На экране в 375 это две строки из четырёх, и
//именно из-за них ряд не помещался никуда.
//
//Складываемость при этом обязана сохраниться: «без типу» и «без оцінки»
//вместе показывают встречи, у которых нет ни того, ни другого, и это не
//побочный эффект, а то, ради чего фильтры и заводились, когда садятся
//прибирать список. Поэтому здесь меню с галочками, а не выбор одного из
//четырёх: выпадающий список умеет ровно одно значение.
//
//Панель, щелчок мимо и Escape — те же, что у отбора по датам: это соседи по
//ряду, и вести себя они должны одинаково.

const GAPS = [
    { param: 'nameless', word: 'nameless.button' },
    { param: 'nosummary', word: 'nosummary.button' },
    { param: 'notype', word: 'notype.button' },
    { param: 'norating', word: 'norating.button' },
];

export default function GapsMenu({ counts = {} }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const boxRef = useRef(null);
    const panelRef = useRef(null);
    const [open, setOpen] = useState(false);

    usePanelFit(panelRef, open);

    useEffect(() => {
        if (!open) return undefined;

        const outside = (event) => {
            if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
        };
        const key = (event) => { if (event.key === 'Escape') setOpen(false); };

        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', key);
        };
    }, [open]);

    const isOn = (param) => searchParams.get(param) === '1';

    //строка не показывается, когда пробелов нет: предлагать «показать ноль
    //встреч» незачем. Включённый фильтр остаётся — иначе из пустого списка
    //не будет выхода
    const rows = GAPS.filter((gap) => (counts[gap.param] ?? 0) > 0 || isOn(gap.param));
    const active = GAPS.filter((gap) => isOn(gap.param));

    if (!rows.length) return null;

    function toggle(param) {
        const next = new URLSearchParams(searchParams.toString());
        if (isOn(param)) next.delete(param);
        else next.set(param, '1');
        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    function clear() {
        const next = new URLSearchParams(searchParams.toString());
        for (const gap of GAPS) next.delete(gap.param);
        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    //Подпись говорит, что именно отобрано. Кнопка, которая выглядит одинаково
    //с отбором и без него, — главный способ забыть, что половина списка
    //спрятана. Один включённый фильтр называется словом, несколько — числом.
    const label =
        active.length === 0 ? T('gaps.button')
            : active.length === 1 ? T(active[0].word)
                : `${T('gaps.button')} · ${active.length}`;

    return (
        <span className={styles.box} ref={boxRef}>
            <button
                type="button"
                className={styles.trigger}
                data-active={active.length ? 'true' : undefined}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen(!open)}
                title={T('gaps.title')}
            >
                {label}
                {active.length === 0 && (
                    <span className={styles.count}>{rows.length}</span>
                )}
            </button>

            {open && (
                <div ref={panelRef} className={styles.panel} role="dialog" aria-label={T('gaps.title')}>
                    {rows.map((gap) => (
                        <label key={gap.param} className={styles.row}>
                            <input
                                type="checkbox"
                                className={styles.box2}
                                checked={isOn(gap.param)}
                                onChange={() => toggle(gap.param)}
                            />
                            <span className={styles.word}>{T(gap.word)}</span>
                            <span className={styles.num}>{counts[gap.param] ?? 0}</span>
                        </label>
                    ))}

                    {active.length > 0 && (
                        <button type="button" className={styles.clear} onClick={clear}>
                            {T('gaps.clear')}
                        </button>
                    )}
                </div>
            )}
        </span>
    );
}
