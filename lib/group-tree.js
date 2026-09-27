//Папки встреч: чистые правила дерева.
//
//Здесь нет ни базы, ни запроса — только то, что можно проверить на списке
//объектов: как из плоских строк собирается дерево, куда группу переносить
//нельзя, что считается её потомками и сколько встреч под ней лежит.
//
//Отдельным файлом — по той же причине, что и lib/column-types.js рядом с
//lib/columns.js: правила, которые легко ошибиться написать, должны
//проверяться тестом без живой базы. Настоящий сторож всё равно стоит на
//сервере (lib/groups.js) — здесь та же логика, но её можно прогнать за
//миллисекунду на любых данных, включая испорченные.

//Название папки. Длиннее шестидесяти знаков в боковую панель не помещается, и
//обрезать его при показе значит показывать одинаковые «Клиенты — проект…»
export const MAX_GROUP_NAME = 60;

//Насколько глубоко можно вкладывать. Не запрет, а страховка отрисовки:
//отступ каждого уровня — 14px, и на двадцатом уровне название уезжает за край
//панели. Проверяется при переносе и при создании подпапки.
export const MAX_GROUP_DEPTH = 10;

//Имя, пригодное для записи. Пустое — это не имя, и ошибка об этом честнее,
//чем папка без названия, которую потом не найти в списке.
export function normalizeGroupName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME);
}

//Строки по id. Нужно почти всем остальным функциям, поэтому считается один раз
//и передаётся дальше.
export function indexGroups(groups) {
    return new Map((groups ?? []).map((group) => [group.id, group]));
}

//Родитель строки, независимо от того, как поле назвали.
//
//Из базы приходит parent_id, из браузера — parentId, а внутри дерева удобнее
//короткое parent. Разбираться в этом на каждой строке — верный способ однажды
//прочитать undefined и получить папку, которая молча уехала в корень.
const parentOf = (group) => group?.parent_id ?? group?.parentId ?? group?.parent ?? null;

//Сортировка соседей: сначала заданный порядок, потом имя. localeCompare без
//указания языка — списки короткие, а разница между «Ё» и «Е» здесь не решает
const bySeat = (a, b) =>
    (a.position ?? 0) - (b.position ?? 0) || String(a.name ?? '').localeCompare(String(b.name ?? ''));

//Цепочка родителей этой строки замыкается на себя?
//
//Проверяется ДО того, как строки связываются в дерево, и вот почему: связать
//сначала, а искать цикл потом — значит построить кольцо из настоящих ссылок,
//по которому потом не пройдёт ни отрисовка, ни сортировка. Стек переполняется
//не в проверке, а в первом же обходе, и виноватым выглядит обход.
function chainLoops(nodes, node) {
    const seen = new Set();
    let current = node;

    while (current?.parent) {
        if (seen.has(current.id)) return true;
        seen.add(current.id);

        const next = nodes.get(current.parent);
        //родителя нет в выборке — цепочка просто кончилась, это не цикл
        if (!next) return false;
        if (next.id === node.id) return true;
        current = next;
    }

    return false;
}

//Плоские строки → дерево.
//
//Строка, чей родитель не найден (его удалили мимо приложения, или он чужой и
//до выборки не доехал), становится корневой, а не исчезает. Потерять папку
//из-за битой ссылки хуже, чем показать её не на своём месте.
//
//Строка внутри цикла тоже становится корневой — и без связи с родителем.
//Кольцо в данных не должно превращаться в кольцо в памяти: показать такую
//папку в корне можно, а обойти дерево с кольцом — нельзя.
export function buildGroupTree(groups) {
    const rows = groups ?? [];
    const nodes = new Map(rows.map((group) => [group.id, { ...group, parent: parentOf(group), children: [] }]));
    const roots = [];

    for (const node of nodes.values()) {
        const parent = node.parent && !chainLoops(nodes, node) ? nodes.get(node.parent) : null;
        if (parent && parent.id !== node.id) parent.children.push(node);
        else roots.push(node);
    }

    const sort = (list) => {
        list.sort(bySeat);
        for (const node of list) sort(node.children);
    };
    sort(roots);

    return roots;
}

//Дерево → плоский список с глубиной, в том порядке, в каком его рисуют.
//Свёрнутые ветки пропускаются целиком: `isOpen` решает вызывающий.
export function flattenGroupTree(roots, isOpen = () => true, depth = 0) {
    const out = [];

    for (const node of roots) {
        out.push({ group: node, depth, hasChildren: node.children.length > 0 });
        if (node.children.length && isOpen(node.id)) {
            out.push(...flattenGroupTree(node.children, isOpen, depth + 1));
        }
    }

    return out;
}

//Сама папка и всё, что под ней, — списком id.
//
//Это ответ на вопрос «что показать, когда выбрали папку»: встречи самой папки
//И её подпапок. Иначе родительская папка выглядела бы пустой при полных
//дочерних, и человек не понимал бы, куда делись его встречи.
//
//Посещённые помечаются: испорченные данные с циклом не должны вешать сервер.
export function subtreeIds(groups, rootId) {
    const byParent = new Map();
    for (const group of groups ?? []) {
        const parent = parentOf(group);
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent).push(group.id);
    }

    const out = [];
    const seen = new Set();
    const queue = [rootId];

    while (queue.length) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        queue.push(...(byParent.get(id) ?? []));
    }

    return out;
}

//Глубина папки: 0 у корневой. Обрыв по посещённым — на случай цикла в данных.
export function depthOf(groups, id) {
    const byId = indexGroups(groups);
    let depth = 0;
    let current = byId.get(id);
    const seen = new Set();

    while (current && parentOf(current)) {
        if (seen.has(current.id)) return depth;
        seen.add(current.id);
        current = byId.get(parentOf(current));
        depth += 1;
    }

    return depth;
}

//Высота поддерева: 0 у листа. Нужна, чтобы перенос не утопил ветку за предел
//глубины — переносится ведь не одна папка, а всё, что под ней.
export function heightOf(groups, id) {
    const byParent = new Map();
    for (const group of groups ?? []) {
        const parent = parentOf(group);
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent).push(group.id);
    }

    const seen = new Set();
    const measure = (node) => {
        if (seen.has(node)) return 0;
        seen.add(node);
        const kids = byParent.get(node) ?? [];
        return kids.length ? 1 + Math.max(...kids.map(measure)) : 0;
    };

    return measure(id);
}

//Станет ли дерево циклическим, если у `id` окажется родитель `parentId`.
//
//Три случая, и все три встречались вживую: папка сама себе родитель, папка под
//собственной подпапкой, и уже испорченные данные, в которых цепочка родителей
//не кончается. Последний важен отдельно: без счётчика посещённых проверка
//зациклилась бы сама, проверяя цикл.
export function wouldCycle(groups, id, parentId) {
    if (!parentId) return false;
    if (parentId === id) return true;

    const byId = indexGroups(groups);
    const seen = new Set();
    let current = parentId;

    while (current) {
        if (current === id) return true;
        if (seen.has(current)) return true;
        seen.add(current);
        current = parentOf(byId.get(current));
    }

    return false;
}

//Куда эту папку можно перенести: всё, кроме себя самой и собственного
//поддерева. Список для выпадашки — сервер проверит то же самое ещё раз, это
//не защита, а способ не предлагать заведомо невозможное.
export function moveTargets(groups, id) {
    const banned = new Set(subtreeIds(groups, id));
    return (groups ?? []).filter((group) => !banned.has(group.id));
}

//Сколько встреч в каждой папке.
//
//Два числа, и они разные по смыслу: `direct` — сколько лежит ровно здесь,
//`total` — сколько во всём поддереве. Показывается total, потому что нажатие
//на папку открывает именно поддерево; direct нужен, чтобы отличить папку,
//которая сама пуста и служит только рубрикой.
//
//Встреча, лежащая и в папке, и в её подпапке, в total считается один раз:
//иначе «12» в родителе при 10 настоящих встречах выглядит как ошибка.
export function countsByGroup(groups, membership) {
    const byParent = new Map();
    for (const group of groups ?? []) {
        const parent = parentOf(group);
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent).push(group.id);
    }

    const setOf = (id) => {
        const value = membership?.get?.(id) ?? membership?.[id];
        if (!value) return [];
        return Array.isArray(value) ? value : [...value];
    };

    const counts = new Map();
    const seen = new Set();

    //собственный набор встреч поддерева — и есть то, что показывается
    const collect = (id) => {
        if (seen.has(id)) return new Set();
        seen.add(id);

        const own = new Set(setOf(id));
        const all = new Set(own);
        for (const child of byParent.get(id) ?? []) {
            for (const meetingId of collect(child)) all.add(meetingId);
        }

        counts.set(id, { direct: own.size, total: all.size });
        return all;
    };

    for (const group of groups ?? []) collect(group.id);

    return counts;
}

//Путь от корня до папки, названиями. «Клиенты › Acme › Внедрение» — то, что
//показывается над таблицей, когда папка выбрана.
export function groupPath(groups, id) {
    const byId = indexGroups(groups);
    const path = [];
    const seen = new Set();
    let current = byId.get(id);

    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current);
        current = byId.get(parentOf(current));
    }

    return path;
}

// Shared by server and client; importing constants from a client component
// into a server page turns them into client references instead of strings.
export const FOLDER_KEY = 'folder';
export const UNGROUPED = '__ungrouped';

export function folderMeetingIds(groups, membership, selected, meetings = []) {
    if (selected === UNGROUPED) {
        const filed = new Set([...membership.values()].flat());
        return new Set(meetings.filter(m => !filed.has(m.id)).map(m => m.id));
    }
    if (!selected) return null;
    return new Set(subtreeIds(groups, selected).flatMap(id => membership.get(id) ?? []));
}
