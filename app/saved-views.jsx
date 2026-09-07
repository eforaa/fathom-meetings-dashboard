'use client';

import { useMemo, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import { usePanelFit } from './use-panel-fit';
import styles from './saved-views.module.css';

//Сохранённые виды. Вид — это вся строка запроса (фильтры, группировка,
//сортировка, поиск, даты): у Fathom состояние списка целиком живёт в адресе,
//поэтому «сохранить вид» — это запомнить строку под именем, а «применить» —
//вернуться на неё. Хранение в localStorage браузера, по решению: без миграций
//и без сервера; ключ привязан к владельцу, чтобы на общей машине виды не
//смешивались.

const keyFor = (owner) => `fathom:views:${owner || 'anon'}`;
//своё событие, чтобы после записи снимок перечитался в этой же вкладке
//(storage-событие браузер шлёт только в другие вкладки)
const CHANGED = 'fathom:views-changed';

//localStorage читается через useSyncExternalStore, а не эффектом с setState:
//это внешнее хранилище, и так его чтение SSR-безопасно и не спорит с линтером
function subscribe(cb) {
    window.addEventListener('storage', cb);
    window.addEventListener(CHANGED, cb);
    return () => {
        window.removeEventListener('storage', cb);
        window.removeEventListener(CHANGED, cb);
    };
}

export default function SavedViews({ owner }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const boxRef = useRef(null);
    const panelRef = useRef(null);
    const inputRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [naming, setNaming] = useState(false);
    const [draft, setDraft] = useState('');

    usePanelFit(panelRef, open);

    const key = keyFor(owner);
    //на сервере снимок пустой (там нет localStorage) — так же, как поступает
    //column-resize: сервер не знает, что лежит в браузере у этого человека
    const raw = useSyncExternalStore(
        subscribe,
        () => {
            try {
                return localStorage.getItem(key) ?? '[]';
            } catch {
                return '[]';
            }
        },
        () => '[]',
    );

    const views = useMemo(() => {
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter((v) => v && typeof v.name === 'string') : [];
        } catch {
            return [];
        }
    }, [raw]);

    useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => {
            if (boxRef.current && !boxRef.current.contains(event.target)) {
                setOpen(false);
                setNaming(false);
            }
        };
        const onKey = (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
                setNaming(false);
            }
        };
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    useEffect(() => {
        if (naming) inputRef.current?.focus();
    }, [naming]);

    const currentQuery = searchParams.toString();

    function write(next) {
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            //приватный режим или переполнение — молча остаёмся без сохранения,
            //список в этой сессии всё равно уже показан
        }
        window.dispatchEvent(new Event(CHANGED));
    }

    function apply(view) {
        setOpen(false);
        router.push(view.query ? `/?${view.query}` : '/');
    }

    function saveCurrent() {
        const name = draft.trim();
        if (!name) return;
        //одно имя — один вид: повторное сохранение под тем же именем обновляет
        write([...views.filter((v) => v.name !== name), { name, query: currentQuery }]);
        setNaming(false);
        setDraft('');
    }

    function remove(name) {
        write(views.filter((v) => v.name !== name));
    }

    return (
        <span className={styles.box} ref={boxRef}>
            <button
                type="button"
                className={styles.trigger}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen(!open)}
                title={T('views.title')}
            >
                {T('views.button')}
                {views.length > 0 && <span className={styles.count}>{views.length}</span>}
            </button>

            {open && (
                <div ref={panelRef} className={styles.panel} role="dialog" aria-label={T('views.title')}>
                    {views.length === 0 && !naming && <p className={styles.empty}>{T('views.empty')}</p>}

                    {views.map((view) => (
                        <div key={view.name} className={styles.row}>
                            <button type="button" className={styles.apply} onClick={() => apply(view)} title={view.name}>
                                {view.name}
                            </button>
                            <button
                                type="button"
                                className={styles.del}
                                aria-label={T('views.remove')}
                                onClick={() => remove(view.name)}
                            >
                                ×
                            </button>
                        </div>
                    ))}

                    {naming ? (
                        <div className={styles.namer}>
                            <input
                                ref={inputRef}
                                className={styles.input}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') saveCurrent();
                                }}
                                placeholder={T('views.namePlaceholder')}
                                maxLength={60}
                            />
                            <button type="button" className={styles.save} onClick={saveCurrent}>
                                {T('views.save')}
                            </button>
                        </div>
                    ) : (
                        <button type="button" className={styles.add} onClick={() => setNaming(true)}>
                            + {T('views.saveCurrent')}
                        </button>
                    )}
                </div>
            )}
        </span>
    );
}
