// Пакетная правка: что маршрут принимает и кому на самом деле пишет.
//
// База сюда не нужна: проверяются правила, а не запись. Самое важное здесь —
// разделение на «изменили» и «и так было»: именно оно превращает ответ
// «9 из 12» в факт, а не в догадку страницы.
import { idsOf, patchOf, splitByNeed, groupRestore, sameTypes, MAX_BULK } from '../lib/bulk.js';
import { check, done } from './_check.mjs';

const ID = (n) => `0000000${n}-1111-4222-8333-444444444444`.slice(-36);
const A = ID(1), B = ID(2), C = ID(3);

//--- какие id вообще принимаются --------------------------------------------
check('настоящие id проходят', idsOf([A, B]), [A, B]);
check('повтор не удваивает работу', idsOf([A, A, B]), [A, B]);
check('не-id отсекается до базы — иначе Postgres ответил бы пятисотой',
    idsOf([A, 'вчерашняя встреча', 42, null]), [A]);
check('не массив — пустой список', idsOf('всё'), []);
check('свой предел у вызывающего: выгрузка берёт больше, чем правка',
    idsOf([A, B, C], 2).length, 2);
check('длиннее предела не бывает',
    idsOf(Array.from({ length: MAX_BULK + 50 }, (_, i) => ID(i).slice(0, 36))).length <= MAX_BULK, true);

//--- что ставим -------------------------------------------------------------
check('известные типы принимаются',
    patchOf({ types: ['client_meeting'] }).types, ['client_meeting']);
check('выдуманный тип не доедет до базы',
    patchOf({ types: ['вечеринка'] }).types, null);
//пустой список — это «снять тип», и его нельзя путать с «поле не прислали»
check('пустой список очищает поле', patchOf({ types: [] }).types, null);
check('поле, которого нет в запросе, не трогается', 'types' in patchOf({ importance: 3 }), false);
check('важность принимается', patchOf({ importance: 4 }).importance, 4);
check('важность вне шкалы прижимается к ней', patchOf({ importance: 99 }).importance, 5);
check('пустой запрос — пустая правка', Object.keys(patchOf({})).length, 0);
check('мусор вместо set — тоже', Object.keys(patchOf('ага')).length, 0);

//--- кому писать ------------------------------------------------------------
const rows = [
    { id: A, types: ['internal_planning'], importance: 2 },
    { id: B, types: ['client_meeting'], importance: 0 },
    { id: C, types: null, importance: 5 },
];

const setClient = patchOf({ types: ['client_meeting'] });

check('пишем только тем, у кого значение другое',
    splitByNeed(rows, setClient).changed, [A, C]);
check('у кого уже стоит — «и так было», а не «изменено»',
    splitByNeed(rows, setClient).unchanged, [B]);
check('порядок типов внутри поля значения не меняет',
    splitByNeed([{ id: A, types: ['a', 'b'] }], { types: ['b', 'a'] }).unchanged, [A]);
check('снятие типа у того, у кого его нет, — тоже «и так было»',
    splitByNeed([{ id: C, types: null }], { types: null }).unchanged, [C]);
check('важность: ноль и отсутствие значения — одно и то же',
    splitByNeed([{ id: A, importance: null }], { importance: 0 }).unchanged, [A]);
check('две правки сразу: хватает одного несовпадения',
    splitByNeed([{ id: A, types: ['x'], importance: 2 }],
        { types: ['x'], importance: 3 }).changed, [A]);
check('пустой список строк не ломает разделение',
    splitByNeed([], setClient), { changed: [], unchanged: [] });

//--- отмена -----------------------------------------------------------------
//прежние значения возвращаются построчно, но писать построчно — это N
//запросов в базу; одинаковые значения собираются в одну группу
const restore = groupRestore([
    { id: A, types: ['internal_planning'], importance: 2 },
    { id: B, types: ['internal_planning'], importance: 2 },
    { id: C, types: [], importance: 0 },
]);

check('одинаковые прежние значения — одна запись в базу', restore.length, 2);
check('и обе встречи в ней', restore[0].ids, [A, B]);
check('разные значения не смешиваются', restore[1].ids, [C]);
check('в группе лежит готовая правка', restore[0].patch.importance, 2);
check('чужой мусор в списке отмены пропускается',
    groupRestore([{ id: 'не id', types: [] }, { id: A, importance: 1 }]).length, 1);
check('строка без единого поля не создаёт пустой записи',
    groupRestore([{ id: A }]).length, 0);
check('не массив — нечего отменять', groupRestore(null), []);

//--- «пришло ли с сервера не то, что я показываю» ----------------------------
//Этим вопросом задаётся ячейка типов в строке, и ошибалась она молча: после
//пакетной правки сервер знал новые типы, а ячейка продолжала показывать
//старые — до перезагрузки страницы. Сравнение по ссылке тут не годится:
//массив прилетает новый при каждой отрисовке.
check('один и тот же набор — совпадает', sameTypes(['a', 'b'], ['a', 'b']), true);
check('порядок значения не имеет: это набор, а не последовательность',
    sameTypes(['a', 'b'], ['b', 'a']), true);
check('разные наборы не совпадают', sameTypes(['a'], ['b']), false);
check('лишний тип — уже другой набор', sameTypes(['a'], ['a', 'b']), false);
check('пусто и пусто — совпадает', sameTypes([], []), true);
check('null и пусто — одно и то же: поле без типов хранится как null',
    sameTypes(null, []), true);
check('пусто и непусто — нет', sameTypes(null, ['a']), false);

done();
