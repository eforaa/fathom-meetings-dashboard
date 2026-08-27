// Восстановление из копии.
//
// Копия, которую ни разу не разворачивали, — предположение, а не страховка.
// Здесь проверяется всё, что можно выяснить про неё, не трогая базу: читается
// ли файл, сходятся ли связи внутри него, в каком порядке ложатся таблицы и
// что случится с испорченной строкой.
import {
    parseBackup, checkLinks, plan, compare, RESTORE_ORDER, CONFLICT_KEY, BATCH,
} from '../lib/restore.js';
import { toNdjson } from '../lib/backup.js';
import { check, done } from './_check.mjs';

const file =
    toNdjson('meetings', [{ id: 'm1', title: 'Планёрка' }, { id: 'm2', title: 'Разбор' }]) +
    toNdjson('participants', [
        { meeting_id: 'm1', identity: 'a@b.io', name: 'Аня' },
        { meeting_id: 'm2', identity: 'boris', name: 'Борис' },
    ]) +
    toNdjson('custom_columns', [{ id: 'c1', name: 'Статус' }]);

//--- чтение -----------------------------------------------------------------
const parsed = parseBackup(file);

check('таблицы разобраны', [...parsed.rows.keys()].sort(), ['custom_columns', 'meetings', 'participants']);
check('строки на месте', parsed.rows.get('meetings').length, 2);
check('значения целы', parsed.rows.get('meetings')[0].title, 'Планёрка');
check('целый файл не даёт ошибок', parsed.broken, []);

//Испорченная строка не должна ронять весь файл — ради этого копия и хранится
//построчно. Она должна быть названа и пропущена.
const damaged = parseBackup(`${file}{"table":"meetings","row":\n`);
check('битая строка не уносит остальные', damaged.rows.get('meetings').length, 2);
check('и о ней сказано', damaged.broken.length, 1);
check('с номером строки', damaged.broken[0].line > 0, true);

check('строка без таблицы отбрасывается',
    parseBackup('{"row":{"id":1}}').broken.length, 1);
check('пустой файл — пустой разбор', parseBackup('').rows.size, 0);
check('пустые строки не считаются битыми', parseBackup('\n\n').broken, []);

//--- связи внутри копии -----------------------------------------------------
//файл может быть цел построчно и при этом бесполезен: участники ссылаются на
//встречи, которых в копии нет, и восстановление упрётся во внешний ключ
check('связи сходятся', checkLinks(parsed).orphans, []);
check('и встречи посчитаны', checkLinks(parsed).meetings, 2);

const broken = parseBackup(
    toNdjson('meetings', [{ id: 'm1' }]) +
    toNdjson('participants', [{ meeting_id: 'НЕТ ТАКОЙ', identity: 'x' }]),
);
check('висящая ссылка находится до записи, а не во время',
    checkLinks(broken).orphans, ['НЕТ ТАКОЙ']);

//--- план записи ------------------------------------------------------------
const { steps, unknown } = plan(parsed);

//встречи обязаны лечь раньше участников: обратный порядок упрётся во внешний
//ключ на первой же пачке
check('порядок таблиц соблюдён',
    steps.map((step) => step.table), ['custom_columns', 'meetings', 'participants']);
check('у каждой пачки есть ключ совпадения',
    steps.every((step) => step.onConflict), true);
check('участники узнаются по паре встреча+человек',
    CONFLICT_KEY.participants, 'meeting_id,identity');
check('порядок описан целиком', RESTORE_ORDER.length, Object.keys(CONFLICT_KEY).length);

//пачками: пять тысяч строк одним куском PostgREST не примет, а построчно —
//это пять тысяч запросов
const many = parseBackup(toNdjson('meetings', Array.from({ length: 2500 }, (_, i) => ({ id: `m${i}` }))));
check('длинная таблица режется на пачки', plan(many).steps.length, 3);
check('размер пачки не превышен',
    plan(many).steps.every((step) => step.rows.length <= BATCH), true);
check('и ни одна строка не потеряна',
    plan(many).steps.reduce((n, step) => n + step.rows.length, 0), 2500);
check('размер пачки можно задать', plan(many, { batch: 500 }).steps.length, 5);

//таблица, о которой мы не знаем, не должна исчезнуть молча
check('незнакомая таблица названа вслух',
    plan(parseBackup(toNdjson('прочее', [{ id: 1 }]))).unknown, ['прочее']);

//--- сравнение с живой базой ------------------------------------------------
const backupRows = [{ id: 'm1', title: 'Планёрка' }, { id: 'm2', title: 'Разбор' }];

check('всё совпало', compare(backupRows, backupRows).same, 2);
check('строка изменилась после копии',
    compare(backupRows, [{ id: 'm1', title: 'Планёрка' }, { id: 'm2', title: 'Другое' }]).changed, ['m2']);
check('строка исчезла из базы',
    compare(backupRows, [{ id: 'm1', title: 'Планёрка' }]).missing, ['m2']);
//новая колонка в базе — это развитие схемы, а не расхождение
check('появившаяся в базе колонка расхождением не считается',
    compare(backupRows, [
        { id: 'm1', title: 'Планёрка', archived: false },
        { id: 'm2', title: 'Разбор', archived: true },
    ]).same, 2);
check('пустая база — всё пропало', compare(backupRows, []).missing.length, 2);

//Составной ключ. У участников строка узнаётся по паре «встреча + человек»:
//сравнение по одному meeting_id оставляло бы от встречи одного участника и
//объявляло остальных изменившимися. Первая репетиция именно так и соврала —
//4498 «изменений» на ровном месте.
const people = [
    { meeting_id: 'm1', identity: 'a@b.io', name: 'Аня' },
    { meeting_id: 'm1', identity: 'boris', name: 'Борис' },
    { meeting_id: 'm2', identity: 'a@b.io', name: 'Аня' },
];

check('пара «встреча + человек» различает участников одной встречи',
    compare(people, people, 'meeting_id,identity').same, 3);
check('и не выдаёт совпадающих за изменившихся',
    compare(people, people, 'meeting_id,identity').changed, []);
check('настоящее изменение видно',
    compare(people, [people[0], { ...people[1], name: 'Boris' }, people[2]],
        'meeting_id,identity').changed, ['m1']);
check('пропавший участник виден отдельно',
    compare(people, [people[0], people[2]], 'meeting_id,identity').missing, ['m1']);

done();
