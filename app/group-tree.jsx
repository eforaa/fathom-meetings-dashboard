'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FOLDER_KEY, UNGROUPED, buildGroupTree, flattenGroupTree, countsByGroup, moveTargets } from '@/lib/group-tree';
import { useT } from './lang-context';
import styles from './group-tree.module.css';

//Папки в боковой панели.
//
//Отличие от уровней группировки, которые стоят ниже в той же панели: те
//раскладывают строки по тому, что во встрече УЖЕ записано (тип, дата,
//участники), и живут в адресной строке одной буквой. Папка — это то, что
//человек решил сам, и оно должно пережить закрытие вкладки. Отсюда таблица в
//базе, а не параметр.
//
//Выбранная папка живёт в ?folder=<id>. Не в ?group= — там уже сидит
//группировка по колонке, и два разных смысла под одним именем однажды
//встретятся в одной ссылке.


//пока папок нет, дерево свёрнуто по умолчанию. Развёрнутость — это не вид, её
//не надо носить в ссылке, поэтому она живёт в состоянии панели
export default function GroupTree({ groups, members, selected }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    //какой строке сейчас правят имя, и что в поле
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState('');
    //какая строка сейчас переносится (строка превращается в выбор родителя)
    const [movingId, setMovingId] = useState(null);
    //какая строка спрашивает про удаление. Отдельного окна нет намеренно:
    //подтверждение стоит там же, где кнопка, и не перекрывает дерево
    const [askDelete, setAskDelete] = useState(null);
    //какое меню «⋯» открыто
    const [menuId, setMenuId] = useState(null);
    //создаём новую папку: null — не создаём, иначе id родителя или '' для корня
    const [creating, setCreating] = useState(null);
    const [newName, setNewName] = useState('');
    const [collapsed, setCollapsed] = useState(() => new Set());

    const roots = useMemo(() => buildGroupTree(groups), [groups]);

    //membership приходит с сервера простым объектом — по сети Map не ездит
    const counts = useMemo(() => countsByGroup(groups, members ?? {}), [groups, members]);

    //Путь до выбранной папки всегда раскрыт.
    //
    //Это не состояние, а следствие: выбрана папка — значит, до неё видно.
    //Написанное состоянием (эффект, который при смене выбора чистит свёрнутые)
    //это была лишняя перерисовка на каждый переход и лишний повод рассинхрону:
    //свёрнутость успевала показаться до того, как эффект её снимал.
    const onPath = useMemo(() => {
        const path = new Set();
        if (!selected) return path;

        const byId = new Map((groups ?? []).map((group) => [group.id, group]));
        let current = byId.get(selected);
        while (current && !path.has(current.id)) {
            path.add(current.id);
            current = byId.get(current.parent_id);
        }
        return path;
    }, [selected, groups]);

    const rows = useMemo(
        () => flattenGroupTree(roots, (id) => onPath.has(id) || !collapsed.has(id)),
        [roots, collapsed, onPath],
    );

    //Escape закрывает сначала меню, потом правку
    useEffect(() => {
        function onKey(event) {
            if (event.key !== 'Escape') return;
            if (menuId) setMenuId(null);
            else if (askDelete) setAskDelete(null);
            else if (movingId) setMovingId(null);
            else if (editingId) setEditingId(null);
            else if (creating !== null) setCreating(null);
        }

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menuId, askDelete, movingId, editingId, creating]);

    //--- адресная строка -----------------------------------------------------
    function pick(id) {
        const next = new URLSearchParams(searchParams.toString());
        if (!id || id === selected) next.delete(FOLDER_KEY);
        else next.set(FOLDER_KEY, id);

        //выбор папки — это другой список, и «только эти» от прошлой правки к
        //нему не относится
        next.delete('only');

        const query = next.toString();
        router.push(query ? `/?${query}` : '/');
    }

    //--- запросы -------------------------------------------------------------
    async function send(url, options) {
        setBusy(true);
        setError(null);

        try {
            const response = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...options,
            });
            const answer = await response.json().catch(() => ({}));

            if (!response.ok) throw new Error(answer.error || T('groups.failed'));

            //дерево целиком живёт на сервере, поэтому после правки страница
            //перечитывается: счётчики, список и фильтр обязаны сойтись
            router.refresh();
            return answer;
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : T('groups.failed'));
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function create(parentId) {
        const name = newName.trim();
        setCreating(null);
        setNewName('');
        if (!name) return;

        await send('/api/groups', {
            method: 'POST',
            body: JSON.stringify({ name, parentId: parentId || null }),
        });
    }

    async function rename(group) {
        const name = draft.trim();
        setEditingId(null);
        if (!name || name === group.name) return;

        await send(`/api/groups/${group.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        });
    }

    async function move(group, parentId) {
        setMovingId(null);
        if ((parentId || null) === (group.parent_id ?? null)) return;

        await send(`/api/groups/${group.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ parentId: parentId || null }),
        });
    }

    async function remove(group, cascade) {
        setAskDelete(null);
        const done = await send(`/api/groups/${group.id}${cascade ? '?cascade=1' : ''}`, {
            method: 'DELETE',
        });

        //стоять на фильтре по удалённой папке нельзя — список молча опустеет
        if (done && selected && done.deleted?.includes(selected)) pick(null);
    }

    const toggle = (id) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    //--- разметка ------------------------------------------------------------
    return (
        <nav className={styles.panel} aria-label={T('groups.title')}>
            <div className={styles.head}>
                <span className={styles.title}>{T('groups.title')}</span>
                <button
                    type="button"
                    className={styles.add}
                    disabled={busy}
                    onClick={() => { setCreating(''); setNewName(''); }}
                    title={T('groups.new')}
                >
                    +
                </button>
            </div>

            {error && <p className={styles.error} role="status">{error}</p>}

            {/* «все встречи» — не папка, а выход из фильтра. Ему нужна своя
                строка: убрать фильтр повторным нажатием на выбранную папку
                догадается не каждый */}
            <button
                type="button"
                className={styles.all}
                data-on={selected ? undefined : 'true'}
                onClick={() => pick(null)}
            >
                {T('groups.all')}
            </button>
            <button type="button" className={styles.all}
                data-on={selected === UNGROUPED ? 'true' : undefined}
                onClick={() => pick(UNGROUPED)}>
                {T('groups.ungrouped')}
            </button>

            {creating === '' && (
                <NameInput
                    value={newName}
                    onChange={setNewName}
                    onCommit={() => create(null)}
                    onCancel={() => setCreating(null)}
                    label={T('groups.namePlaceholder')}
                />
            )}

            {rows.length === 0 ? (
                <p className={styles.empty}>
                    {T('groups.empty')}
                    <span className={styles.emptyHint}>{T('groups.emptyHint')}</span>
                </p>
            ) : (
                <ul className={styles.tree}>
                    {rows.map(({ group, depth, hasChildren }) => {
                        const count = counts.get(group.id) ?? { direct: 0, total: 0 };
                        //стрелка обязана показывать то же, что показывает
                        //список: на пути до выбранной папки ветка раскрыта,
                        //что бы ни было свёрнуто раньше
                        const open = onPath.has(group.id) || !collapsed.has(group.id);

                        return (
                            <li key={group.id} className={styles.item}>
                                <div className={styles.row} style={{ paddingLeft: `${4 + depth * 14}px` }}>
                                    {hasChildren ? (
                                        <button
                                            type="button"
                                            className={styles.twist}
                                            onClick={() => toggle(group.id)}
                                            aria-label={open ? T('groups.collapse') : T('groups.expand')}
                                            aria-expanded={open}
                                        >
                                            {open ? '▾' : '▸'}
                                        </button>
                                    ) : (
                                        <span className={styles.twistGap} aria-hidden="true" />
                                    )}

                                    {editingId === group.id ? (
                                        <NameInput
                                            value={draft}
                                            onChange={setDraft}
                                            onCommit={() => rename(group)}
                                            onCancel={() => setEditingId(null)}
                                            label={T('groups.namePlaceholder')}
                                        />
                                    ) : movingId === group.id ? (
                                        <select
                                            className={styles.picker}
                                            defaultValue="__choose"
                                            autoFocus
                                            aria-label={T('groups.moveTo')}
                                            onChange={(event) => move(group, event.target.value)}
                                            onBlur={() => setMovingId(null)}
                                        >
                                            <option value="__choose" disabled>{T('groups.moveTo')}</option>
                                            {group.parent_id && <option value="">{T('groups.toRoot')}</option>}
                                            {/* себя и своё поддерево в списке нет: сервер
                                                откажет всё равно, но предлагать невозможное
                                                незачем */}
                                            {moveTargets(groups, group.id).map((target) => (
                                                <option key={target.id} value={target.id}>{target.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <button
                                            type="button"
                                            className={styles.node}
                                            data-on={group.id === selected ? 'true' : undefined}
                                            onClick={() => pick(group.id)}
                                            title={T('groups.counts', { total: count.total, direct: count.direct })}
                                        >
                                            <span className={styles.name}>{group.name}</span>
                                            <span className={styles.count}>{count.total}</span>
                                        </button>
                                    )}

                                    {editingId !== group.id && movingId !== group.id && (
                                        <button
                                            type="button"
                                            className={styles.more}
                                            aria-haspopup="menu"
                                            aria-expanded={menuId === group.id}
                                            title={T('groups.actions', { name: group.name })}
                                            onClick={() => setMenuId(menuId === group.id ? null : group.id)}
                                        >
                                            ⋯
                                        </button>
                                    )}
                                </div>

                                {menuId === group.id && (
                                    <div className={styles.menu} role="menu">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className={styles.menuItem}
                                            onClick={() => { setMenuId(null); setCreating(group.id); setNewName(''); }}
                                        >
                                            {T('groups.newSub')}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className={styles.menuItem}
                                            onClick={() => { setMenuId(null); setDraft(group.name); setEditingId(group.id); }}
                                        >
                                            {T('groups.rename')}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className={styles.menuItem}
                                            onClick={() => { setMenuId(null); setMovingId(group.id); }}
                                        >
                                            {T('groups.move')}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className={`${styles.menuItem} ${styles.danger}`}
                                            onClick={() => { setMenuId(null); setAskDelete(group.id); }}
                                        >
                                            {T('groups.delete')}
                                        </button>
                                    </div>
                                )}

                                {askDelete === group.id && (
                                    <div className={styles.confirm} role="alertdialog" aria-label={T('groups.delete')}>
                                        {/* встречи остаются — и об этом сказано прямо здесь,
                                            а не в справке: без этой строки удаление папки
                                            выглядит как удаление встреч */}
                                        <p className={styles.confirmText}>
                                            {T('groups.deleteAsk', { name: group.name })}
                                        </p>
                                        <div className={styles.confirmRow}>
                                            <button
                                                type="button"
                                                className={styles.confirmYes}
                                                disabled={busy}
                                                onClick={() => remove(group, false)}
                                            >
                                                {T('groups.delete')}
                                            </button>
                                            {hasChildren && (
                                                <button
                                                    type="button"
                                                    className={styles.confirmYes}
                                                    disabled={busy}
                                                    onClick={() => remove(group, true)}
                                                >
                                                    {T('groups.deleteCascade')}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={styles.confirmNo}
                                                onClick={() => setAskDelete(null)}
                                            >
                                                {T('common.cancel')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {creating === group.id && (
                                    <div style={{ paddingLeft: `${18 + depth * 14}px` }}>
                                        <NameInput
                                            value={newName}
                                            onChange={setNewName}
                                            onCommit={() => create(group.id)}
                                            onCancel={() => setCreating(null)}
                                            label={T('groups.namePlaceholder')}
                                        />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </nav>
    );
}

//поле имени: одно и то же при создании и при переименовании, поэтому вынесено.
//Enter сохраняет, Escape отменяет, уход фокуса сохраняет — как у названия
//встречи в строке таблицы
function NameInput({ value, onChange, onCommit, onCancel, label }) {
    const ref = useRef(null);

    useEffect(() => { ref.current?.focus(); }, []);

    return (
        <input
            ref={ref}
            className={styles.input}
            value={value}
            aria-label={label}
            placeholder={label}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') onCommit();
                if (event.key === 'Escape') onCancel();
            }}
            onBlur={onCommit}
        />
    );
}
