'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    isTyping, nextIndex, wantsSearch, opensRow, clearsCursor,
    selectionAction, escapeMeans,
} from '@/lib/keys';
import { useSelection } from './selection';

//Clicking a row, and walking the list from the keyboard.
//
//One client component wraps all the rows and listens once, instead of every
//row carrying its own handlers: the rows stay server-rendered, and 222 of them
//cost nothing extra in the browser.
//
//The title is still a real link — right-click, middle-click and "open in a new
//tab" have to keep working, and a screen reader needs something to announce.
//This only adds what a link cannot: making the whole row a target, and moving
//between rows without the mouse.
export default function RowNav({ children }) {
    const router = useRouter();
    const selection = useSelection();
    const boxRef = useRef(null);
    //index of the row the keyboard cursor sits on; null until a key is pressed
    const cursor = useRef(null);

    //--- clicking anywhere on the row ---------------------------------------
    function onClick(event) {
        const row = event.target.closest('[data-href]');
        if (!row) return;

        //a control was the target: the star, the type picker, the pencil, the
        //title link itself. those do their own job.
        if (event.target.closest('a, button, input, textarea, select, label')) return;

        //someone was selecting text, not aiming at the row
        if (window.getSelection()?.toString()) return;

        //the browser's own "open in a new tab" gestures keep their meaning
        if (event.metaKey || event.ctrlKey || event.button === 1) {
            window.open(row.dataset.href, '_blank', 'noopener');
            return;
        }

        router.push(row.dataset.href);
    }

    //--- walking the list ----------------------------------------------------
    useEffect(() => {
        //read from the DOM each time rather than from state: rows come and go
        //as groups collapse and the list refreshes, and a collapsed group is
        //not rendered at all, so the cursor can never land on a hidden row
        const rows = () => [...(boxRef.current?.querySelectorAll('[data-href]') ?? [])];

        function moveTo(index) {
            const list = rows();
            const row = list[index];
            if (!row) return;

            cursor.current = index;
            for (const other of list) delete other.dataset.cursor;
            row.dataset.cursor = 'on';
            row.scrollIntoView({ block: 'nearest' });
        }

        function onKey(event) {
            const target = event.target;
            const typing = isTyping(target?.tagName, target?.isContentEditable);

            //"/" jumps to the search box from anywhere on the page
            if (wantsSearch(event.key, typing)) {
                const box = document.querySelector('[data-search-box]');
                if (box) {
                    event.preventDefault();
                    box.focus();
                    box.select?.();
                }
                return;
            }

            //never take a letter from someone writing, and leave the browser's
            //own shortcuts alone
            if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

            if (clearsCursor(event.key)) {
                //пока есть отметка, Escape снимает её: панель закрывает низ
                //экрана, и убрать её человек хочет раньше, чем курсор
                if (escapeMeans(selection.count > 0) === 'selection') {
                    selection.clear();
                    return;
                }

                for (const row of rows()) delete row.dataset.cursor;
                cursor.current = null;
                return;
            }

            //отметка строк: x, Shift+X, a
            const marking = selectionAction(event.key, { shiftKey: event.shiftKey, typing });
            if (marking) {
                event.preventDefault();

                if (marking === 'all') {
                    selection.selectAll();
                    return;
                }

                //x и Shift+X работают по строке под курсором; без курсора
                //отмечать нечего — и молча брать первую строку было бы
                //неожиданностью
                const row = cursor.current == null ? null : rows()[cursor.current];
                if (!row?.dataset.id) return;

                if (marking === 'range') selection.toggleRange(row.dataset.id);
                else selection.toggle(row.dataset.id);
                return;
            }

            if (opensRow(event.key, cursor.current)) {
                const row = rows()[cursor.current];
                if (row) {
                    event.preventDefault();
                    router.push(row.dataset.href);
                }
                return;
            }

            const next = nextIndex(event.key, cursor.current, rows().length);
            if (next == null) return;

            //the arrows would otherwise scroll the page out from under the cursor
            event.preventDefault();
            moveTo(next);
        }

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [router, selection]);

    //the click handler sits on the wrapper rather than on each row: the
    //keyboard route is the listener above, and every row still contains a real
    //link, so nothing here is reachable by mouse alone
    return (
        //rowgroup: the rows are the table's body, and a screen reader needs to
        //be told that this wrapper is not something else in between
        <div ref={boxRef} onClick={onClick} role="rowgroup">
            {children}
        </div>
    );
}
