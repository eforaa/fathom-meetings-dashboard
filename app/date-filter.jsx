'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import { readRange, presetRange, rangeShape, rangeLabel } from '@/lib/date-range';
import { usePanelFit } from './use-panel-fit';
import styles from './date-filter.module.css';

//Отбор встреч по датам.
//
//Живёт в адресе страницы (?from=&to=), как поиск и остальные фильтры: ссылку
//на «встречи за прошлую неделю» можно отправить человеку, и он увидит то же
//самое. Состояние отбора в браузере такую ссылку сделало бы невозможной.
//
//Поля — обычные input[type=date]: у браузера есть свой календарь, он знает
//про раскладку, про формат даты в стране человека и про доступность больше,
//чем успел бы узнать самодельный. Рядом четыре быстрые кнопки, потому что в
//девяти случаях из десяти нужен не «промежуток», а «последняя неделя».

export default function DateFilter() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const boxRef = useRef(null);
    const panelRef = useRef(null);
    const [open, setOpen] = useState(false);

    //панель шире кнопки, а кнопка на телефоне переносится — без этого она
    //уезжает за край экрана
    usePanelFit(panelRef, open);

    const range = readRange({
        from: searchParams.get('from'),
        to: searchParams.get('to'),
    });

    //закрытие по щелчку мимо и по Escape — как у остальных панелей в таблице
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

    function apply(next) {
        const params = new URLSearchParams(searchParams.toString());

        if (next.from) params.set('from', next.from);
        else params.delete('from');

        if (next.to) params.set('to', next.to);
        else params.delete('to');

        router.push(params.toString() ? `/?${params.toString()}` : '/');
    }

    const shape = rangeShape(range);

    //подпись на кнопке говорит, что именно отобрано: кнопка «Даты», которая
    //выглядит одинаково с отбором и без него, — главный способ забыть, что
    //половина списка спрятана. Ту же строку показывает свёрнутая панель
    //сортировки, поэтому она собирается в lib/date-range.js
    const label = rangeLabel(range, T);

    const PRESETS = ['today', 'week', 'month', 'thisMonth'];

    return (
        <span className={styles.box} ref={boxRef}>
            <button
                type="button"
                className={styles.trigger}
                data-active={shape.kind === 'any' ? undefined : 'true'}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen(!open)}
                title={T('dates.title')}
            >
                <CalendarIcon />
                {label}
            </button>

            {open && (
                <div ref={panelRef} className={styles.panel} role="dialog" aria-label={T('dates.title')}>
                    <div className={styles.presets}>
                        {PRESETS.map((name) => (
                            <button
                                key={name}
                                type="button"
                                className={styles.preset}
                                onClick={() => {
                                    //«сейчас» берётся здесь, в браузере: у человека
                                    //свой сегодняшний день, и он может не совпадать
                                    //с днём сервера
                                    apply(presetRange(name, new Date().toISOString()));
                                    setOpen(false);
                                }}
                            >
                                {T(`dates.${name}`)}
                            </button>
                        ))}
                    </div>

                    <div className={styles.fields}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>{T('dates.from')}</span>
                            <input
                                type="date"
                                className={styles.input}
                                value={range.from ?? ''}
                                //верхняя граница у нижнего поля и наоборот: браузер
                                //сам не даст выбрать конец раньше начала
                                max={range.to ?? undefined}
                                onChange={(event) => apply({ ...range, from: event.target.value || null })}
                            />
                        </label>

                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>{T('dates.to')}</span>
                            <input
                                type="date"
                                className={styles.input}
                                value={range.to ?? ''}
                                min={range.from ?? undefined}
                                onChange={(event) => apply({ ...range, to: event.target.value || null })}
                            />
                        </label>
                    </div>

                    {shape.kind !== 'any' && (
                        <button
                            type="button"
                            className={styles.clear}
                            onClick={() => { apply({ from: null, to: null }); setOpen(false); }}
                        >
                            {T('dates.clear')}
                        </button>
                    )}
                </div>
            )}
        </span>
    );
}

function CalendarIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="3.5" width="12" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2 7h12M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
    );
}
