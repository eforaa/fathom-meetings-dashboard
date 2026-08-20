//Ширина колонок, которую человек выставил сам.
//
//Вся арифметика собрана здесь, отдельно от мыши и от DOM: перетаскивание —
//это события и пиксели, а вот «что считать допустимой шириной», «что делать,
//когда колонок стало больше» и «как это пережить между заходами» — правила,
//и правила должны проверяться тестами без браузера.
//
//Сетка таблицы описана строкой вида
//    124px minmax(230px, 2.2fr) 148px …
//то есть часть дорожек тянется, часть нет. Пока никто ничего не двигал, так и
//остаётся: колонки сами делят ширину экрана. Но стоит потянуть одну — тянуться
//перестают все, потому что иначе соседи разъезжались бы вслед за движением
//руки, и человек ловил бы не ту границу, которую держит. Поэтому первое
//движение ЗАМОРАЖИВАЕТ все дорожки в пикселях, какими они были в тот момент.

//колонка уже нечитаема, ещё немного и в неё не влезет ни одно слово
export const MIN_WIDTH = 64;
//дальше растягивать бессмысленно: строка перестаёт читаться как строка
export const MAX_WIDTH = 720;

export const STORAGE_KEY = 'fathom.column-widths.v1';

//разбор строки дорожек. Пробелы внутри minmax(...) не разделяют дорожки,
//поэтому просто split(' ') здесь не годится
export function parseTracks(value) {
    const tracks = [];
    let depth = 0;
    let current = '';

    for (const char of String(value ?? '')) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;

        if (char === ' ' && depth === 0) {
            if (current) tracks.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    if (current) tracks.push(current);
    return tracks;
}

export const serializeTracks = (tracks) => tracks.join(' ');

//ширина в разрешённых пределах, целыми пикселями
export const clampWidth = (px) =>
    Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(px) || MIN_WIDTH)));

//заморозка: измеренные браузером ширины становятся дорожками в пикселях
export const freeze = (widths) => widths.map((px) => `${clampWidth(px)}px`);

//одна колонка получает новую ширину. Остальные не двигаются: их значения уже
//в пикселях, а значит ничего не перераспределяется
export function setWidth(tracks, index, px) {
    if (index < 0 || index >= tracks.length) return tracks;

    const next = tracks.slice();
    next[index] = `${clampWidth(px)}px`;
    return next;
}

//вернуть одной колонке ту ширину, что задумана в коде страницы
export function restoreTrack(tracks, defaults, index) {
    if (index < 0 || index >= tracks.length || index >= defaults.length) return tracks;

    const next = tracks.slice();
    next[index] = defaults[index];
    return next;
}

//Сохранённое из прошлого захода против сегодняшней таблицы.
//
//Колонок могло стать больше или меньше: человек добавил свою колонку, убрал
//её, открыл страницу с другим набором. Подгонять старые ширины к новому набору
//бессмысленно — они относились к другим колонкам. Честнее отдать сегодняшние
//значения по умолчанию, чем показать съехавшую таблицу.
export function reconcile(stored, defaults) {
    if (!Array.isArray(stored) || stored.length !== defaults.length) return defaults;
    if (!stored.every((track) => typeof track === 'string' && track.trim())) return defaults;

    return stored;
}

//чтение и запись переживают отсутствие localStorage: приватное окно, запрет
//хранилища, сервер. Ширина колонок не то, ради чего можно уронить страницу
export function readStored(storage) {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function writeStored(storage, tracks) {
    try {
        if (tracks) storage?.setItem(STORAGE_KEY, JSON.stringify(tracks));
        else storage?.removeItem(STORAGE_KEY);
    } catch {
        //молча: не сохранилось — значит в следующий раз колонки будут обычные
    }
}
