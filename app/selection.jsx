'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

//Кто отмечен — на всю таблицу одно место.
//
//Отметка живёт здесь, а не в строках, по той же причине, по которой здесь же
//живут клик и клавиатура: строк бывает две сотни, и они остаются серверной
//разметкой. В браузер уезжает одна галочка на строку, а не строка целиком.
//
//Порядок id приходит с сервера в том же порядке, в каком нарисованы строки —
//он нужен для Shift+X: «от прошлой отметки до нынешней» без порядка не
//выразить. При группировке одна встреча попадает в несколько веток; id в
//списке тогда повторяется, и это правильно — отмечена встреча, а не её место
//в дереве.

const SelectionContext = createContext(null);

export function useSelection() {
    const value = useContext(SelectionContext);
    if (!value) throw new Error('useSelection вне SelectionProvider');
    return value;
}

//Тот же ответ, но без провайдера — null, а не ошибка. Редакторы типа и
//важности живут и в списке, и на странице одной встречи; на второй никакой
//пачки нет, и падать из-за этого им не за что.
export function useMaybeSelection() {
    return useContext(SelectionContext);
}

export default function SelectionProvider({ ids = [], children }) {
    const [selected, setSelected] = useState(() => new Set());
    //идёт ли сейчас запись. Знать об этом должны не только кнопки панели:
    //пока пачка меняется, то же самое должно быть видно в самих строках —
    //иначе человек смотрит на список и не понимает, к нему ли относится
    //полоса, бегущая внизу экрана
    const [applying, setApplying] = useState(false);
    //последняя тронутая строка — точка отсчёта для Shift+X
    const anchor = useRef(null);

    const order = useMemo(() => [...new Set(ids)], [ids]);

    const toggle = useCallback((id) => {
        anchor.current = id;
        setSelected((was) => {
            const next = new Set(was);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    //от прошлой тронутой строки до нынешней включительно. Без прошлой это
    //обычная отметка одной строки, а не «от начала списка»: человек не просил
    //двести строк
    const toggleRange = useCallback((id) => {
        setSelected((was) => {
            const from = order.indexOf(anchor.current);
            const to = order.indexOf(id);
            if (from === -1 || to === -1) {
                const single = new Set(was);
                single.add(id);
                return single;
            }

            const [start, end] = from <= to ? [from, to] : [to, from];
            const next = new Set(was);
            for (let i = start; i <= end; i += 1) next.add(order[i]);
            return next;
        });
        anchor.current = id;
    }, [order]);

    //«всё» — это всё, что прошло поиск и фильтры, а не вся база
    const selectAll = useCallback(() => setSelected(new Set(order)), [order]);
    const clear = useCallback(() => {
        anchor.current = null;
        setSelected(new Set());
    }, []);

    const value = useMemo(() => ({
        applying,
        setApplying,
        selected,
        ids: [...selected],
        count: selected.size,
        //пусто · частично · всё — трёхсостоянийная галочка в шапке
        state: selected.size === 0 ? 'none' : selected.size >= order.length ? 'all' : 'some',
        order,
        has: (id) => selected.has(id),
        toggle,
        toggleRange,
        selectAll,
        clear,
    }), [applying, selected, order, toggle, toggleRange, selectAll, clear]);

    return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
