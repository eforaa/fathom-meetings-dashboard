'use client';

import { useLayoutEffect } from 'react';

//Всплывающая панель, которая не вылезает за экран.
//
//Панель привязана к своей кнопке, а кнопка на телефоне может стоять где
//угодно: ряд над таблицей переносится, и «Прогалини» оказываются то слева,
//то у правого края. Панель шириной 232 пикселя, открытая от кнопки на 254-м,
//уезжает за край на 111 — и половина галочек оказывается за экраном.
//
//Одним CSS это не решается: `left: 0` губит кнопки справа, `right: 0` —
//кнопки слева, а какая из них где, известно только в браузере. Поэтому здесь
//замер: панель ставится как задумано, а потом сдвигается ровно настолько,
//чтобы уместиться, оставив по 12 пикселей полей.
//
//useLayoutEffect, а не useEffect: сдвиг обязан произойти до того, как кадр
//покажут, иначе панель будет заметно прыгать на месте.
const MARGIN = 12;

export function usePanelFit(ref, open) {
    useLayoutEffect(() => {
        const panel = ref.current;
        if (!open || !panel) return;

        //сначала снимаем прошлый сдвиг — иначе замер покажет уже сдвинутое
        panel.style.transform = '';

        const box = panel.getBoundingClientRect();
        const screen = document.documentElement.clientWidth;

        let shift = 0;
        if (box.right > screen - MARGIN) shift = screen - MARGIN - box.right;
        //левый край важнее правого: панель, начинающаяся за экраном, теряет
        //начало каждой строки, а это подписи
        if (box.left + shift < MARGIN) shift = MARGIN - box.left;

        if (shift) panel.style.transform = `translateX(${Math.round(shift)}px)`;
    }, [ref, open]);
}
