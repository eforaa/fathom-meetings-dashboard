'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import { usePanelFit } from './use-panel-fit';
import {
    FIELDS, OPS_BY_TYPE, NO_VALUE_OPS, fieldType,
    decodeConditions, encodeConditions, countConditions,
} from '@/lib/filter-conditions';
import styles from './filter-conditions.module.css';

//Конструктор фильтров «И/ИЛИ» поверх колоночных. Правится локально — черновик
//в state, — и применяется одной кнопкой: гнать серверный re-render на каждую
//букву значения незачем. Итог кодируется в ?cond= и оттуда же читается, как
//и весь остальной вид, поэтому фильтр делится ссылкой и попадает в
//сохранённые виды.

function freshCond() {
    return { field: 'title', op: 'contains', value: '' };
}

export default function FilterConditions({ types = [] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const boxRef = useRef(null);
    const panelRef = useRef(null);
    const [open, setOpen] = useState(false);

    const applied = decodeConditions(searchParams.get('cond'));
    const appliedCount = countConditions(applied);

    const [match, setMatch] = useState(applied.match);
    const [rows, setRows] = useState(applied.items.length ? applied.items : [freshCond()]);

    usePanelFit(panelRef, open);

    //каждый раз при открытии показываем то, что реально применено сейчас —
    //иначе черновик разъезжается с адресом после навигации
    function openPanel() {
        const current = decodeConditions(searchParams.get('cond'));
        setMatch(current.match);
        setRows(current.items.length ? current.items : [freshCond()]);
        setOpen(true);
    }

    useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => {
            if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    function setRow(index, patch) {
        setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    }

    function changeField(index, field) {
        //новое поле — новый набор операторов; берём первый и чистим значение
        const op = OPS_BY_TYPE[fieldType(field)][0];
        setRow(index, { field, op, value: '' });
    }

    function addRow() {
        setRows((current) => [...current, freshCond()]);
    }

    function removeRow(index) {
        setRows((current) => (current.length === 1 ? [freshCond()] : current.filter((_, i) => i !== index)));
    }

    function apply() {
        //в адрес идут только осмысленные условия: у оператора со значением оно
        //должно быть заполнено, иначе строка ничего не отбирает
        const items = rows.filter((row) => NO_VALUE_OPS.has(row.op) || String(row.value ?? '').trim() !== '');
        const encoded = encodeConditions({ match, items });
        const next = new URLSearchParams(searchParams.toString());
        if (encoded) next.set('cond', encoded);
        else next.delete('cond');
        router.push(next.toString() ? `/?${next.toString()}` : '/');
        setOpen(false);
    }

    function clear() {
        const next = new URLSearchParams(searchParams.toString());
        next.delete('cond');
        router.push(next.toString() ? `/?${next.toString()}` : '/');
        setMatch('all');
        setRows([freshCond()]);
        setOpen(false);
    }

    function valueInput(row, index) {
        if (NO_VALUE_OPS.has(row.op)) return null;
        if (row.field === 'type') {
            return (
                <select
                    className={styles.select}
                    value={row.value}
                    onChange={(event) => setRow(index, { value: event.target.value })}
                >
                    <option value="">—</option>
                    {types.map((type) => (
                        <option key={type.key} value={type.key}>{type.label}</option>
                    ))}
                </select>
            );
        }
        const type = fieldType(row.field);
        const inputType = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
        return (
            <input
                className={styles.value}
                type={inputType}
                value={row.value}
                onChange={(event) => setRow(index, { value: event.target.value })}
                placeholder={T('cond.value')}
            />
        );
    }

    return (
        <span className={styles.box} ref={boxRef}>
            <button
                type="button"
                className={styles.trigger}
                data-active={appliedCount ? 'true' : undefined}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => (open ? setOpen(false) : openPanel())}
                title={T('cond.title')}
            >
                {T('cond.button')}
                {appliedCount > 0 && <span className={styles.count}>{appliedCount}</span>}
            </button>

            {open && (
                <div ref={panelRef} className={styles.panel} role="dialog" aria-label={T('cond.title')}>
                    <div className={styles.matchRow}>
                        <span className={styles.matchLabel}>{T('cond.matchLabel')}</span>
                        <div className={styles.seg}>
                            <button type="button" data-active={match === 'all'} className={styles.segBtn} onClick={() => setMatch('all')}>
                                {T('cond.match.all')}
                            </button>
                            <button type="button" data-active={match === 'any'} className={styles.segBtn} onClick={() => setMatch('any')}>
                                {T('cond.match.any')}
                            </button>
                        </div>
                    </div>

                    <div className={styles.rows}>
                        {rows.map((row, index) => (
                            <div key={index} className={styles.row}>
                                <select
                                    className={styles.select}
                                    value={row.field}
                                    onChange={(event) => changeField(index, event.target.value)}
                                >
                                    {FIELDS.map((field) => (
                                        <option key={field.key} value={field.key}>{T(`cond.field.${field.key}`)}</option>
                                    ))}
                                </select>

                                <select
                                    className={styles.select}
                                    value={row.op}
                                    onChange={(event) => setRow(index, { op: event.target.value })}
                                >
                                    {OPS_BY_TYPE[fieldType(row.field)].map((op) => (
                                        <option key={op} value={op}>{T(`cond.op.${op}`)}</option>
                                    ))}
                                </select>

                                {valueInput(row, index)}

                                <button
                                    type="button"
                                    className={styles.remove}
                                    aria-label={T('cond.remove')}
                                    onClick={() => removeRow(index)}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    <button type="button" className={styles.add} onClick={addRow}>
                        + {T('cond.add')}
                    </button>

                    <div className={styles.foot}>
                        {appliedCount > 0 && (
                            <button type="button" className={styles.clear} onClick={clear}>
                                {T('cond.clear')}
                            </button>
                        )}
                        <button type="button" className={styles.apply} onClick={apply}>
                            {T('cond.apply')}
                        </button>
                    </div>
                </div>
            )}
        </span>
    );
}
