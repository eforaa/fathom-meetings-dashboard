import { MEETING_TYPES, MAX_TYPES } from './format.js';
import { isUuid, listOf, int } from './http.js';

//Правила пакетной правки: что принять от браузера и кому из встреч на самом
//деле нужно писать в базу.
//
//Всё здесь чистое — ни базы, ни запроса, — потому что проверять надо именно
//эти правила: чужие id, значение, которое уже стоит, и попытка изменить
//полтаблицы одним нажатием.

//Столько встреч можно изменить одним запросом. Список на экране редко бывает
//длиннее, а вот цикл, дорвавшийся до маршрута, бывает
export const MAX_BULK = 200;

//Только настоящие id, без повторов, не больше предела. Возвращается массив,
//а не Set: дальше он идёт в запрос и в ответ, где нужен порядок.
//
//Предел задаётся вызывающим, потому что он разный по смыслу: изменить за раз
//двести встреч — это уже много, а выгрузить в файл двести мало, там нормально
//отдать весь список целиком
export function idsOf(value, max = MAX_BULK) {
    if (!Array.isArray(value)) return [];

    const seen = new Set();
    for (const item of value) {
        if (isUuid(item)) seen.add(String(item));
        if (seen.size >= max) break;
    }

    return [...seen];
}

//Что именно ставим. Пустой объект означает «менять нечего» — это не ошибка
//формата, а бессмысленный запрос, и маршрут отвечает на него отдельно.
//
//types: null очищает поле, поэтому пустой список — это тоже осмысленное
//значение, и отличать «не прислали» от «прислали пусто» приходится по
//наличию ключа, а не по длине
export function patchOf(set) {
    const patch = {};
    if (!set || typeof set !== 'object') return patch;

    if ('types' in set) {
        const types = listOf(set.types, MEETING_TYPES, { max: MAX_TYPES });
        patch.types = types.length ? types : null;
    }

    if ('importance' in set) {
        patch.importance = int(set.importance, { min: 0, max: 5 });
    }

    return patch;
}

//сравнение того, что просят, с тем, что уже лежит.
//
//Экспортируется, потому что тем же вопросом задаётся ячейка типов в строке:
//«пришло ли с сервера не то, что я показываю». Порядок значения не имеет —
//набор типов это набор, а не последовательность
export const sameTypes = (a, b) => {
    const left = a ?? [];
    const right = b ?? [];
    if (left.length !== right.length) return false;
    return [...left].sort().join('|') === [...right].sort().join('|');
};

//Кому писать, а кому не надо.
//
//Разделение делает сервер, а не браузер: только у сервера есть нынешние
//значения. Из-за этого «9 встреч из 12» — это факт, а не догадка страницы, и
//человек видит, что три встречи уже были такими, а не что что-то сломалось.
export function splitByNeed(rows, patch) {
    const changed = [];
    const unchanged = [];

    for (const row of rows) {
        let needs = false;

        if ('types' in patch && !sameTypes(row.types, patch.types)) needs = true;
        if ('importance' in patch && (row.importance ?? 0) !== patch.importance) needs = true;

        (needs ? changed : unchanged).push(row.id);
    }

    return { changed, unchanged };
}

//Отмена. Браузер присылает прежние значения построчно, но писать по строке —
//это N запросов к базе внутри одного запроса к нам. Одинаковые значения
//встречаются пачками (двенадцати встречам задали один тип — у всех
//двенадцати прежнее значение чаще всего одно), поэтому строки собираются в
//группы с общим значением, и запись идёт по группе.
export function groupRestore(rows) {
    if (!Array.isArray(rows)) return [];

    const groups = new Map();

    for (const row of rows) {
        if (!isUuid(row?.id)) continue;

        const patch = patchOf(row);
        if (!Object.keys(patch).length) continue;

        //ключ описывает значение целиком, поэтому у одинаковых значений он один
        const key = JSON.stringify(patch);
        if (!groups.has(key)) groups.set(key, { patch, ids: [] });

        const group = groups.get(key);
        if (!group.ids.includes(row.id)) group.ids.push(row.id);
    }

    return [...groups.values()];
}
