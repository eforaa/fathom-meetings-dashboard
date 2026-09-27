import { db } from './supabase.js';
import { isUuid } from './http.js';
import {
    MAX_GROUP_DEPTH,
    normalizeGroupName,
    subtreeIds,
    depthOf,
    heightOf,
    wouldCycle,
    indexGroups,
} from './group-tree.js';

//Папки встреч: всё, что ходит в базу.
//
//Правила дерева живут рядом, в lib/group-tree.js, и проверяются без базы.
//Здесь — владение и записи: ни одна функция не принимает владельца со
//стороны, он приходит из сессии или из токена коннектора, и каждый запрос им
//отфильтрован. Сервисный ключ RLS не касается, поэтому проверка «моё ли это»
//делается руками — так же, как в lib/columns.js.

//Сколько встреч можно положить в папку одним вызовом. Тот же порядок, что у
//пакетной правки: экран столько не выделит, цикл выделит
export const MAX_ASSIGN = 200;

// Reject the whole malformed/oversized request before any mutation; never
// silently truncate a batch sent by either the browser or the MCP connector.
export function validateMeetingIds(value) {
    if (!Array.isArray(value) || !value.length) throw new Error('No meetings chosen');
    if (value.some(id => !isUuid(id))) throw new Error('Every meeting id must be a UUID');
    const ids = [...new Set(value.map(id => id.toLowerCase()))];
    if (ids.length > MAX_ASSIGN) throw new Error(`At most ${MAX_ASSIGN} meetings per request`);
    return ids;
}

//Сколько папок может завести один человек. Не продуктовый предел, а сторож:
//боковая панель читает дерево целиком, и десять тысяч папок в ней — это не
//работа, а отказ
export const MAX_GROUPS = 500;

//До применения db/meeting-groups.sql таблиц нет вовсе, и спрашивать их —
//ошибка на весь запрос, то есть пустая главная страница. Ровно та же беда
//была с поисковым индексом и отметкой архива, и лечится так же: чтение
//отвечает пустотой и говорит об этом в лог, запись — внятной ошибкой.
const missingTable = (message) =>
    /relation .* does not exist|could not find the table|schema cache/i.test(String(message ?? ''));

const NOT_APPLIED = 'Meeting groups are not set up yet — apply db/meeting-groups.sql';

//--- чтение -----------------------------------------------------------------

//все папки владельца, плоским списком. Дерево из них строит вызывающий
export async function listGroups(ownerEmail) {
    if (!ownerEmail) return [];

    const { data, error } = await db
        .from('meeting_groups')
        .select('id, name, parent_id, position, created_at')
        .eq('owner_email', ownerEmail)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        if (missingTable(error.message)) {
            console.warn('groups: db/meeting-groups.sql is not applied, showing no folders');
            return [];
        }
        throw new Error(error.message);
    }

    return data ?? [];
}

//кто в какой папке лежит — сырые строки членства этого владельца
export async function listMemberships(ownerEmail) {
    if (!ownerEmail) return [];

    const { data, error } = await db
        .from('meeting_group_members')
        .select('group_id, meeting_id')
        .eq('owner_email', ownerEmail);

    if (error) {
        if (missingTable(error.message)) return [];
        throw new Error(error.message);
    }

    return data ?? [];
}

//членство в виде Map<id папки, id встреч> — то, чего ждут countsByGroup и
//фильтр таблицы
export function membershipByGroup(rows) {
    const map = new Map();

    for (const row of rows ?? []) {
        if (!map.has(row.group_id)) map.set(row.group_id, []);
        map.get(row.group_id).push(row.meeting_id);
    }

    return map;
}

//обратная сторона: Map<id встречи, id папок>. Нужна строке таблицы и панели
//просмотра — «в каких папках эта встреча»
export function membershipByMeeting(rows) {
    const map = new Map();

    for (const row of rows ?? []) {
        if (!map.has(row.meeting_id)) map.set(row.meeting_id, []);
        map.get(row.meeting_id).push(row.group_id);
    }

    return map;
}

//id встреч выбранной папки. По умолчанию — вместе с подпапками: нажатие на
//родителя должно показывать всё, что под ним, иначе рубрика выглядит пустой
//при полных детях. Точное содержимое одной папки берётся includeDescendants:false
export async function meetingIdsInGroup(ownerEmail, groupId, { includeDescendants = true } = {}) {
    if (!ownerEmail || !groupId) return [];

    const groups = await listGroups(ownerEmail);
    //папка чужая или её нет — пустота, а не «показать всё»
    if (!groups.some((group) => group.id === groupId)) return [];

    const ids = includeDescendants ? subtreeIds(groups, groupId) : [groupId];

    const { data, error } = await db
        .from('meeting_group_members')
        .select('meeting_id')
        .eq('owner_email', ownerEmail)
        .in('group_id', ids);

    if (error) {
        if (missingTable(error.message)) return [];
        throw new Error(error.message);
    }

    //одна встреча может лежать и в папке, и в подпапке — в списке она одна
    return [...new Set((data ?? []).map((row) => row.meeting_id))];
}

//--- проверки, общие для маршрута и коннектора -------------------------------

//папка существует и принадлежит этому владельцу
async function ownedGroup(ownerEmail, groupId) {
    if (!ownerEmail) throw new Error('Not signed in');
    if (!isUuid(groupId)) throw new Error('Valid group_id is required');

    const { data, error } = await db
        .from('meeting_groups')
        .select('id, name, parent_id, position')
        .eq('id', groupId)
        .eq('owner_email', ownerEmail)
        .maybeSingle();

    if (error) {
        if (missingTable(error.message)) throw new Error(NOT_APPLIED);
        throw new Error(error.message);
    }
    //«не твоя» и «нет такой» отвечаются одинаково: чужой id не должен
    //подтверждаться сообщением об отказе
    if (!data) throw new Error('Group not found');

    return data;
}

//новый родитель годится: он есть, он этого же владельца, и дерево от него не
//замкнётся. Возвращает список всех папок — он всё равно уже прочитан
async function checkParent(ownerEmail, { id, parentId }) {
    const groups = await listGroups(ownerEmail);

    if (parentId) {
        if (!groups.some((group) => group.id === parentId)) {
            throw new Error('Parent group not found');
        }
        if (id && wouldCycle(groups, id, parentId)) {
            throw new Error('Moving the group there would make the tree loop back on itself');
        }

        //переносится не одна папка, а всё, что под ней, — считаем с высотой
        const branch = id ? heightOf(groups, id) : 0;
        if (depthOf(groups, parentId) + 1 + branch >= MAX_GROUP_DEPTH) {
            throw new Error(`Groups cannot nest deeper than ${MAX_GROUP_DEPTH} levels`);
        }
    }

    return groups;
}

//--- запись ------------------------------------------------------------------

export async function createGroup(ownerEmail, { name, parentId = null } = {}) {
    if (!ownerEmail) throw new Error('Not signed in');

    const clean = normalizeGroupName(name);
    if (!clean) throw new Error('Group name is empty');

    const parent = parentId ? String(parentId) : null;
    const groups = await checkParent(ownerEmail, { id: null, parentId: parent });

    if (groups.length >= MAX_GROUPS) {
        throw new Error(`Too many groups: the limit is ${MAX_GROUPS}`);
    }

    //новая папка встаёт последней среди своих соседей
    const position = groups.filter((group) => (group.parent_id ?? null) === parent).length;

    const { data, error } = await db
        .from('meeting_groups')
        .insert({ owner_email: ownerEmail, name: clean, parent_id: parent, position })
        .select('id, name, parent_id, position')
        .single();

    if (error) {
        if (missingTable(error.message)) throw new Error(NOT_APPLIED);
        throw new Error(error.message);
    }

    return data;
}

export async function renameGroup(ownerEmail, groupId, name) {
    await ownedGroup(ownerEmail, groupId);

    const clean = normalizeGroupName(name);
    if (!clean) throw new Error('Group name is empty');

    const { data, error } = await db
        .from('meeting_groups')
        .update({ name: clean })
        .eq('id', groupId)
        .eq('owner_email', ownerEmail)
        .select('id, name, parent_id, position')
        .single();

    if (error) throw new Error(error.message);

    return data;
}

//Перенос. Проверок три, и все три обязательны: папка моя, новый родитель мой,
//и дерево после переноса остаётся деревом.
export async function moveGroup(ownerEmail, groupId, parentId) {
    await ownedGroup(ownerEmail, groupId);

    const parent = parentId ? String(parentId) : null;
    if (parent === groupId) {
        throw new Error('A group cannot be its own parent');
    }

    const groups = await checkParent(ownerEmail, { id: groupId, parentId: parent });

    //в конец нового списка соседей — иначе папка встанет наравне с чужим
    //порядком и место в списке окажется случайным
    const position = groups.filter(
        (group) => (group.parent_id ?? null) === parent && group.id !== groupId,
    ).length;

    const { data, error } = await db
        .from('meeting_groups')
        .update({ parent_id: parent, position })
        .eq('id', groupId)
        .eq('owner_email', ownerEmail)
        .select('id, name, parent_id, position')
        .single();

    if (error) throw new Error(error.message);

    return data;
}

//Удаление папки.
//
//Встречи остаются — всегда. Пропадают только строки членства: папка была
//способом смотреть на встречи, а не местом их хранения. Это главное свойство
//удаления, и его проверяет тест.
//
//Что делать с подпапками — выбор, и он сделан в пользу наименее разрушительного:
//по умолчанию дети поднимаются на место удалённой папки (к её родителю, или в
//корень, если родителя не было). Удалить ветку целиком можно, но только если
//об этом попросили явно: cascade:true. Встречи и в этом случае целы.
export async function deleteGroup(ownerEmail, groupId, { cascade = false } = {}) {
    const group = await ownedGroup(ownerEmail, groupId);
    const groups = await listGroups(ownerEmail);

    const doomed = cascade ? subtreeIds(groups, groupId) : [groupId];

    if (!cascade) {
        //дети занимают место удаляемой папки
        const { error: liftFailed } = await db
            .from('meeting_groups')
            .update({ parent_id: group.parent_id ?? null })
            .eq('parent_id', groupId)
            .eq('owner_email', ownerEmail);

        if (liftFailed) throw new Error(liftFailed.message);
    }

    //членство снимается явно, а не только каскадом внешнего ключа: в базе,
    //поднятой без db/meeting-groups.sql (руками, по старым скриптам), каскада
    //может не быть, и тогда остались бы висячие строки
    const { error: unlinkFailed } = await db
        .from('meeting_group_members')
        .delete()
        .eq('owner_email', ownerEmail)
        .in('group_id', doomed);

    if (unlinkFailed && !missingTable(unlinkFailed.message)) {
        throw new Error(unlinkFailed.message);
    }

    const { error } = await db
        .from('meeting_groups')
        .delete()
        .eq('owner_email', ownerEmail)
        .in('id', doomed);

    if (error) throw new Error(error.message);

    return { deleted: doomed, cascade };
}

//--- встречи в папках ---------------------------------------------------------

//Только свои встречи, без повторов, не больше предела. Возвращает те id из
//присланных, которые действительно принадлежат этому владельцу.
async function ownedMeetingIds(ownerEmail, ids) {
    const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, MAX_ASSIGN);
    if (!wanted.length) return [];

    const { data, error } = await db
        .from('meetings')
        .select('id')
        .eq('owner_email', ownerEmail)
        .in('id', wanted);

    if (error) throw new Error(error.message);

    const mine = new Set((data ?? []).map((row) => row.id));
    //порядок присланного сохраняется — по нему потом собирается ответ
    return wanted.filter((id) => mine.has(id));
}

//Положить встречи в папку.
//
//Два владения проверяются порознь: папка моя И встречи мои. Чужая встреча не
//становится ошибкой на всю пачку — она называется в ответе отдельной строкой,
//как и в пакетной правке: «12 добавлено, 1 не ваша» понятнее, чем отказ.
export async function assignMeetings(ownerEmail, groupId, meetingIds) {
    await ownedGroup(ownerEmail, groupId);

    const sent = validateMeetingIds(meetingIds);
    if (!sent.length) throw new Error('No meetings chosen');

    const mine = await ownedMeetingIds(ownerEmail, sent);
    const rejected = sent.filter((id) => !mine.includes(id));

    if (!mine.length) return { added: [], rejected, group_id: groupId };

    //повторное добавление — это «уже там», а не ошибка
    const { error } = await db
        .from('meeting_group_members')
        .upsert(
            mine.map((id) => ({ group_id: groupId, meeting_id: id, owner_email: ownerEmail })),
            { onConflict: 'group_id,meeting_id', ignoreDuplicates: true },
        );

    if (error) {
        if (missingTable(error.message)) throw new Error(NOT_APPLIED);
        throw new Error(error.message);
    }

    return { added: mine, rejected, group_id: groupId };
}

//Убрать встречи из папки. Сами встречи не трогаются ни при каких условиях —
//удаляются только строки членства.
export async function removeMeetings(ownerEmail, groupId, meetingIds) {
    await ownedGroup(ownerEmail, groupId);

    const sent = validateMeetingIds(meetingIds);
    if (!sent.length) throw new Error('No meetings chosen');

    const { data, error } = await db
        .from('meeting_group_members')
        .delete()
        .eq('owner_email', ownerEmail)
        .eq('group_id', groupId)
        .in('meeting_id', sent)
        .select('meeting_id');

    if (error) {
        if (missingTable(error.message)) throw new Error(NOT_APPLIED);
        throw new Error(error.message);
    }

    const removed = (data ?? []).map(row => row.meeting_id);
    return { removed, unchanged: sent.filter(id => !removed.includes(id)), group_id: groupId };
}

//--- готовое дерево для экрана и коннектора ----------------------------------

//Папки со счётчиками, плоским списком с глубиной. Один вызов вместо трёх:
//и странице, и коннектору нужно одно и то же — что есть и сколько в нём.
export async function groupsWithCounts(ownerEmail) {
    const groups = await listGroups(ownerEmail);
    if (!groups.length) return { groups: [], membership: new Map() };

    const membership = membershipByGroup(await listMemberships(ownerEmail));

    return { groups, membership };
}

//id папки из адресной строки: своя и существующая, иначе ничего.
//Чужой или выдуманный id обязан означать «фильтра нет», а не «покажи всё
//чужое» и не ошибку страницы
export function pickGroupId(groups, raw) {
    const id = String(raw ?? '').trim();
    if (!id) return null;

    return indexGroups(groups).has(id) ? id : null;
}
