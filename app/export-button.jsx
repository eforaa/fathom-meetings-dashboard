'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLang, useT } from './lang-context';
import styles from './export-button.module.css';

//Выгрузка того, что сейчас на экране.
//
//Список id уходит на сервер готовым — тем же и в том же порядке, что в
//таблице. Поэтому выгрузка совпадает с экраном ровно: тот же отбор по датам,
//тот же поиск, та же сортировка. Собирать файл прямо здесь, в браузере, было
//бы проще, но у страницы нет ни конспектов целиком, ни участников тех встреч,
//что не поместились на экран.
//
//Файл приходит потоком и сохраняется ссылкой, которая живёт долю секунды:
//формы для этого не нужно, а обычная ссылка не умеет ни POST, ни заголовков.

export default function ExportButton({ ids }) {
    const T = useT();
    const lang = useLang();
    const searchParams = useSearchParams();
    const boxRef = useRef(null);

    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

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

    async function download(format) {
        setBusy(true);
        setFailed(false);
        setOpen(false);

        try {
            const response = await fetch('/api/meetings/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids,
                    format,
                    lang,
                    //промежуток дат нужен только для имени файла
                    from: searchParams.get('from'),
                    to: searchParams.get('to'),
                }),
            });

            if (!response.ok) throw new Error(String(response.status));

            //имя файла сервер прислал в заголовке — там же, где оно и должно
            //решаться: только он знает, что попало в файл
            const disposition = response.headers.get('Content-Disposition') ?? '';
            const named = /filename\*=UTF-8''([^;]+)/.exec(disposition);
            const name = named ? decodeURIComponent(named[1]) : `meetings.${format}`;

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            //ссылку надо отпустить, иначе файл висит в памяти вкладки до
            //перезагрузки страницы
            URL.revokeObjectURL(url);
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    }

    return (
        <span className={styles.box} ref={boxRef}>
            <button
                type="button"
                className={styles.trigger}
                disabled={busy || !ids.length}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen(!open)}
                title={T('export.button')}
            >
                <DownIcon />
                {busy ? T('export.working') : T('export.button')}
                {/* число говорит, сколько строк уедет в файл: «выгрузить» без
                    него легко нажать в убеждении, что выгрузится вся база */}
                {!busy && ids.length > 0 && <span className={styles.count}>{ids.length}</span>}
            </button>

            {open && (
                <div className={styles.menu} role="menu">
                    <button type="button" role="menuitem" className={styles.item} onClick={() => download('csv')}>
                        {T('export.csv')}
                    </button>
                    <button type="button" role="menuitem" className={styles.item} onClick={() => download('md')}>
                        {T('export.md')}
                    </button>
                </div>
            )}

            {failed && <span className={styles.failed} role="status">{T('export.failed')}</span>}
        </span>
    );
}

function DownIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2.5v8m0 0L4.5 7M8 10.5L11.5 7M2.5 13.5h11"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
