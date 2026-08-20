'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    parseTracks, serializeTracks, freeze, setWidth, restoreTrack,
    reconcile, readStored, writeStored, MIN_WIDTH,
} from '@/lib/column-widths';
import styles from './column-resize.module.css';

//Границы между колонками, за которые можно тянуть.
//
//Слой поверх таблицы, а не часть её разметки. Таблица остаётся серверной: ни
//одна ячейка не знает, что её ширину можно менять, и ни одна не превращается
//в клиентский компонент ради этого. Здесь только полоски на стыках — их
//положение считается по настоящим ячейкам шапки.
//
//Ширины живут в localStorage, а не в адресе страницы и не в базе. Это
//настройка рабочего места, а не часть того, что человек показывает другим:
//ссылкой делятся, чтобы показать встречи, а не свои колонки.

const KEY_STEP = 16;

export default function ColumnResize({ defaultGrid, lang, label, resetLabel }) {
    const [handles, setHandles] = useState([]);
    //кнопка «ширины по умолчанию» появляется, только когда есть что сбрасывать.
    //Это отдельное состояние, а не взгляд в ref: ref во время отрисовки читать
    //нельзя, да и перерисовки он бы не вызвал
    const [custom, setCustom] = useState(false);
    const tracks = useRef(null);
    const defaults = useRef(parseTracks(defaultGrid));
    const box = useRef(null);

    //таблица — ближайший предок с сеткой; ищем её от собственного узла, чтобы
    //не зависеть от имён классов, которые CSS-модули всё равно перепишут
    const tableOf = useCallback(() => box.current?.parentElement ?? null, []);

    const headCells = useCallback(() => {
        const table = tableOf();
        if (!table) return [];
        const head = table.querySelector('[role="row"]');
        return head ? [...head.children] : [];
    }, [tableOf]);

    //положение полосок = правые края ячеек шапки. Последняя граница не нужна:
    //за краем таблицы тянуть нечего
    const measure = useCallback(() => {
        const cells = headCells();
        if (cells.length < 2) return;

        const left = box.current.getBoundingClientRect().left;
        setHandles(
            cells.slice(0, -1).map((cell, index) => ({
                index,
                x: cell.getBoundingClientRect().right - left,
                width: cell.getBoundingClientRect().width,
            }))
        );
    }, [headCells]);

    const paint = useCallback((next) => {
        tracks.current = next;
        tableOf()?.style.setProperty('--grid', serializeTracks(next));
        setCustom(true);
        measure();
    }, [measure, tableOf]);

    //первое движение замораживает ВСЕ дорожки в пикселях: пока часть из них
    //тянется, соседи ехали бы вслед за рукой и человек ловил бы не ту границу,
    //которую держит
    const ensureFrozen = useCallback(() => {
        if (tracks.current) return tracks.current;

        const widths = headCells().map((cell) => cell.getBoundingClientRect().width);
        tracks.current = freeze(widths);
        return tracks.current;
    }, [headCells]);

    //сохранённое с прошлого захода.
    //
    //Применяется здесь, а не при отрисовке на сервере: сервер не знает, что
    //лежит в браузере у этого человека, и попытка угадать дала бы расхождение
    //между тем, что прислано, и тем, что построено на месте.
    useEffect(() => {
        const saved = readStored(window.localStorage);
        const usable = reconcile(saved, defaults.current);

        //reconcile вернул сегодняшние значения — значит сохранённое не подошло
        //(колонок стало больше или меньше). Хранить его дальше незачем
        if (usable === defaults.current) {
            if (saved) writeStored(window.localStorage, null);
            measure();
        } else {
            paint(usable);
        }

        //ширина окна меняется — стыки едут вместе с ней
        const onResize = () => measure();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
        //effect должен отработать один раз, при появлении таблицы
        //eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const drag = (index) => (event) => {
        event.preventDefault();
        const cells = headCells();
        const cell = cells[index];
        if (!cell) return;

        const start = event.clientX;
        const from = cell.getBoundingClientRect().width;
        const base = ensureFrozen();

        const move = (moved) => {
            paint(setWidth(base, index, Math.max(MIN_WIDTH, from + moved.clientX - start)));
        };

        const stop = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', stop);
            document.body.classList.remove(styles.dragging);
            writeStored(window.localStorage, tracks.current);
        };

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', stop);
        document.body.classList.add(styles.dragging);
    };

    //клавиатура: та же граница стрелками, Home возвращает задуманную ширину.
    //Мышью пользуются не все, а колонка, которую нельзя сузить без мыши, —
    //это колонка, которую часть людей не может сузить вовсе
    const onKey = (index) => (event) => {
        const cells = headCells();
        const cell = cells[index];
        if (!cell) return;

        const width = cell.getBoundingClientRect().width;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const step = event.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP;
            paint(setWidth(ensureFrozen(), index, width + step));
            writeStored(window.localStorage, tracks.current);
            return;
        }

        if (event.key === 'Home' || event.key === 'Escape') {
            event.preventDefault();
            reset(index);
        }
    };

    //двойной щелчок и Home — вернуть этой колонке ту ширину, что задумана
    const reset = (index) => {
        paint(restoreTrack(ensureFrozen(), defaults.current, index));
        writeStored(window.localStorage, tracks.current);
    };

    const resetAll = () => {
        tracks.current = null;
        tableOf()?.style.setProperty('--grid', defaultGrid);
        writeStored(window.localStorage, null);
        setCustom(false);
        measure();
    };

    return (
        <div ref={box} className={styles.layer} aria-hidden={false}>
            {handles.map((handle) => (
                <span
                    key={handle.index}
                    className={styles.handle}
                    style={{ left: handle.x }}
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={label}
                    aria-valuenow={Math.round(handle.width)}
                    onPointerDown={drag(handle.index)}
                    onDoubleClick={() => reset(handle.index)}
                    onKeyDown={onKey(handle.index)}
                />
            ))}

            {/* появляется только когда есть что сбрасывать */}
            {custom && (
                <button type="button" className={styles.reset} onClick={resetAll} lang={lang}>
                    {resetLabel}
                </button>
            )}
        </div>
    );
}
