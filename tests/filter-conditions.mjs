// Конструктор фильтров: модель условий, совпадение записи, кодирование в
// адрес и обратно. Всё это гоняет URL-текст, который человек может править
// руками, поэтому мусор обязан игнорироваться, а не прятать список.
import {
    emptyModel, matchesModel, countConditions,
    encodeConditions, decodeConditions,
} from '../lib/filter-conditions.js';
import { check, isTrue, done } from './_check.mjs';

const rec = {
    title: 'Weekly sync with Acme',
    summary: 'Обсудили релиз и сроки',
    types: ['client_meeting', 'internal_planning'],
    importance: 4,
    duration: 45,
    people: 3,
    date: '2026-03-10T09:00:00Z',
};

// --- пустая модель ничего не отсекает --------------------------------------
isTrue('пустая модель пропускает всё', matchesModel(rec, emptyModel()));
check('в пустой модели ноль условий', countConditions(emptyModel()), 0);

// --- текст ------------------------------------------------------------------
isTrue('contains по названию, без учёта регистра',
    matchesModel(rec, { match: 'all', items: [{ field: 'title', op: 'contains', value: 'acme' }] }));
isTrue('ncontains убирает совпавшее',
    matchesModel(rec, { match: 'all', items: [{ field: 'title', op: 'ncontains', value: 'zzz' }] }));

// --- число ------------------------------------------------------------------
isTrue('importance >= 3 проходит',
    matchesModel(rec, { match: 'all', items: [{ field: 'importance', op: 'gte', value: '3' }] }));
check('importance < 3 не проходит',
    matchesModel(rec, { match: 'all', items: [{ field: 'importance', op: 'lt', value: '3' }] }), false);
isTrue('пустое значение числа ничего не отсекает',
    matchesModel(rec, { match: 'all', items: [{ field: 'duration', op: 'gt', value: '' }] }));

// --- select (тип встречи) ---------------------------------------------------
isTrue('type is client_meeting — есть среди типов',
    matchesModel(rec, { match: 'all', items: [{ field: 'type', op: 'is', value: 'client_meeting' }] }));
check('type isnot client_meeting — исключает эту встречу',
    matchesModel(rec, { match: 'all', items: [{ field: 'type', op: 'isnot', value: 'client_meeting' }] }), false);

// --- дата -------------------------------------------------------------------
isTrue('date after 2026-01-01',
    matchesModel(rec, { match: 'all', items: [{ field: 'date', op: 'after', value: '2026-01-01' }] }));

// --- И против ИЛИ -----------------------------------------------------------
const two = [
    { field: 'type', op: 'is', value: 'onboarding' }, // ложь
    { field: 'importance', op: 'gte', value: '3' },     // правда
];
check('match=all: одно ложное условие валит всё', matchesModel(rec, { match: 'all', items: two }), false);
isTrue('match=any: одного истинного хватает', matchesModel(rec, { match: 'any', items: two }));

// --- empty / nempty ---------------------------------------------------------
isTrue('summary nempty — конспект есть',
    matchesModel(rec, { match: 'all', items: [{ field: 'summary', op: 'nempty' }] }));
isTrue('summary empty на пустом конспекте',
    matchesModel({ ...rec, summary: '' }, { match: 'all', items: [{ field: 'summary', op: 'empty' }] }));

// --- кодирование туда и обратно --------------------------------------------
const model = { match: 'any', items: [
    { field: 'title', op: 'contains', value: 'a;b~c' },
    { field: 'importance', op: 'gte', value: '3' },
] };
check('encode → decode сохраняет модель', decodeConditions(encodeConditions(model)), model);
check('пустая модель кодируется в пустую строку', encodeConditions(emptyModel()), '');
check('пустой адрес — пустая модель', decodeConditions(null), emptyModel());

// --- мусор из адреса --------------------------------------------------------
check('условие по несуществующему полю выбрасывается',
    decodeConditions('all;nosuchfield~contains~x').items, []);

done();
