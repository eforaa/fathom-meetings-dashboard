'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

//Какую встречу показывает панель сбоку.
//
//Отдельное состояние, а не адрес страницы: просмотр не должен стоить потери
//списка. Открыл, полистал, закрыл — фильтры, прокрутка и отметки остались на
//месте. Ссылка «открыть страницу» внутри панели по-прежнему ведёт на обычный
//адрес встречи, поэтому поделиться ею можно как раньше.

const PreviewContext = createContext(null);

export function usePreview() {
    const value = useContext(PreviewContext);
    if (!value) throw new Error('usePreview вне PreviewProvider');
    return value;
}

export default function PreviewProvider({ ids = [], children }) {
    const [openId, setOpenId] = useState(null);
    const order = useMemo(() => [...new Set(ids)], [ids]);

    const open = useCallback((id) => setOpenId(id), []);
    const close = useCallback(() => setOpenId(null), []);

    //шаг по списку в том же порядке, в каком идут строки. Концы не
    //заворачиваются: долистав до последней встречи, человек должен упереться,
    //а не оказаться в начале, гадая, было это или нет
    const step = useCallback((delta) => {
        setOpenId((was) => {
            if (was == null) return was;
            const at = order.indexOf(was);
            if (at === -1) return was;
            const next = Math.min(Math.max(at + delta, 0), order.length - 1);
            return order[next];
        });
    }, [order]);

    const value = useMemo(() => ({
        openId,
        isOpen: openId != null,
        order,
        open,
        close,
        step,
    }), [openId, order, open, close, step]);

    return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
