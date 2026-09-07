//Конструктор фильтров: условия «И/ИЛИ» поверх обычных колоночных фильтров.
//
//Портировано из AI-researcher, но под встречи и без вложенных групп: плоский
//список условий с одним режимом совпадения (все / любое). Этого хватает на
//то, ради чего фильтр и заводят («тип = клиентская И важность ≥ 3»), а
//вложенные скобки в дашборде встреч никто не набирал.
//
//Либа чистая: она принимает нормализованную запись
//{ title, summary, types, importance, duration, people, date } и модель, и
//решает, подходит ли запись. Саму запись собирает страница из встречи — так
//это можно проверить тестом, не таща сюда формат встречи.

//поля, по которым можно фильтровать, и их тип — тип решает набор операторов
export const FIELDS = [
    { key: 'title', type: 'text' },
    { key: 'summary', type: 'text' },
    { key: 'type', type: 'select' },
    { key: 'importance', type: 'number' },
    { key: 'duration', type: 'number' },
    { key: 'people', type: 'number' },
    { key: 'date', type: 'date' },
];

//операторы по типу поля. Порядок — порядок в выпадающем списке
export const OPS_BY_TYPE = {
    text: ['contains', 'ncontains', 'eq', 'neq', 'empty', 'nempty'],
    number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty'],
    select: ['is', 'isnot'],
    date: ['before', 'after'],
};

//операторы, которым не нужно значение: поле либо пустое, либо нет
export const NO_VALUE_OPS = new Set(['empty', 'nempty']);

export const emptyModel = () => ({ match: 'all', items: [] });

export const countConditions = (model) => model?.items?.length ?? 0;

export function fieldType(key) {
    return FIELDS.find((field) => field.key === key)?.type ?? 'text';
}

//пусто — про любой тип: null/пустая строка/пустой массив/ноль-как-отсутствие
function isEmpty(value) {
    if (value == null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function matchOne(record, cond) {
    const { field, op, value } = cond;
    const type = fieldType(field);

    if (op === 'empty') return isEmpty(record[field]);
    if (op === 'nempty') return !isEmpty(record[field]);

    if (type === 'select') {
        const arr = Array.isArray(record.types) ? record.types : [];
        if (op === 'is') return arr.includes(value);
        if (op === 'isnot') return !arr.includes(value);
        return true;
    }

    if (type === 'text') {
        const cell = String(record[field] ?? '').toLowerCase();
        const needle = String(value ?? '').toLowerCase();
        if (op === 'contains') return cell.includes(needle);
        if (op === 'ncontains') return !cell.includes(needle);
        if (op === 'eq') return cell === needle;
        if (op === 'neq') return cell !== needle;
        return true;
    }

    if (type === 'number') {
        const n = Number(record[field]);
        const v = Number(value);
        //нечисло в записи не проходит числовой тест; пустое значение условия
        //ничего не отсекает — иначе едва начатое условие прячет весь список
        if (Number.isNaN(n)) return false;
        if (value === '' || value == null || Number.isNaN(v)) return true;
        if (op === 'eq') return n === v;
        if (op === 'neq') return n !== v;
        if (op === 'gt') return n > v;
        if (op === 'gte') return n >= v;
        if (op === 'lt') return n < v;
        if (op === 'lte') return n <= v;
        return true;
    }

    if (type === 'date') {
        const t = record[field] ? new Date(record[field]).getTime() : NaN;
        const v = value ? new Date(value).getTime() : NaN;
        if (Number.isNaN(t) || Number.isNaN(v)) return true;
        if (op === 'before') return t < v;
        if (op === 'after') return t > v;
        return true;
    }

    return true;
}

export function matchesModel(record, model) {
    const items = model?.items ?? [];
    if (!items.length) return true;
    const results = items.map((cond) => matchOne(record, cond));
    return model.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

//компактно в адрес: match;field,op,value;field,op,value
//разделители — «;» между условиями и «,» внутри: encodeURIComponent
//экранирует оба, если они попадутся В значении (%3B и %2C), поэтому текст
//условия их не подделает. «~» в разделители не годится — его
//encodeURIComponent оставляет как есть, и значение с «~» ломало бы разбор
export function encodeConditions(model) {
    if (!model?.items?.length) return '';
    const parts = model.items.map((cond) =>
        [cond.field, cond.op, cond.value ?? ''].map(encodeURIComponent).join(','),
    );
    return `${model.match === 'any' ? 'any' : 'all'};${parts.join(';')}`;
}

export function decodeConditions(raw) {
    if (!raw) return emptyModel();
    try {
        const [match, ...rest] = String(raw).split(';');
        const items = rest
            .filter(Boolean)
            .map((seg) => {
                const [field, op, value] = seg.split(',').map(decodeURIComponent);
                return { field, op, value: value ?? '' };
            })
            //мусор из адреса не должен создавать условие по несуществующему полю
            .filter((cond) => FIELDS.some((field) => field.key === cond.field));
        return { match: match === 'any' ? 'any' : 'all', items };
    } catch {
        return emptyModel();
    }
}
