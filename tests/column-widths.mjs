// Ширина колонок, которую человек выставил сам.
//
// Мышь здесь не участвует: проверяются правила, а не перетаскивание. Что
// считать допустимой шириной, что делать, когда колонок стало больше, и как
// разобрать строку сетки, в которой пробелы стоят и внутри minmax(...).
import {
    parseTracks, serializeTracks, clampWidth, freeze,
    setWidth, restoreTrack, reconcile, readStored, writeStored, STORAGE_KEY,
    MIN_WIDTH, MAX_WIDTH,
} from '../lib/column-widths.js';
import { check, done } from './_check.mjs';

const GRID = '124px minmax(230px, 2.2fr) 148px 126px minmax(150px, 1.1fr) 104px';

//--- разбор строки сетки ----------------------------------------------------
//split(' ') разорвал бы minmax(230px, 2.2fr) на две «дорожки» и сдвинул все
//колонки правее — молча, потому что строка осталась бы синтаксически годной
check('пробел внутри minmax не разрывает дорожку', parseTracks(GRID).length, 6);
check('дорожки читаются целиком', parseTracks(GRID)[1], 'minmax(230px, 2.2fr)');
check('и собираются обратно', parseTracks('124px 148px').length, 2);
check('пустая строка — ни одной дорожки', parseTracks('').length, 0);
check('мусор вместо строки не роняет разбор', parseTracks(null).length, 0);
check('туда и обратно', serializeTracks(parseTracks('124px 148px')), '124px 148px');

//--- пределы ----------------------------------------------------------------
check('обычная ширина проходит как есть', clampWidth(200), 200);
check('уже минимума не бывает', clampWidth(10), MIN_WIDTH);
check('шире максимума тоже', clampWidth(5000), MAX_WIDTH);
check('дробные пиксели округляются: полпикселя таблице не нужны', clampWidth(180.6), 181);
check('нечисло не превращается в NaN-ширину', clampWidth('широко'), MIN_WIDTH);

//--- заморозка --------------------------------------------------------------
//первое же движение переводит ВСЕ дорожки в пиксели: иначе тянущиеся соседи
//поедут вслед за рукой, и человек будет ловить не ту границу, которую держит
check('измеренные ширины становятся пикселями',
    freeze([124, 302, 148]), ['124px', '302px', '148px']);
check('и они тоже в пределах', freeze([12]), [`${MIN_WIDTH}px`]);

//--- изменение одной колонки ------------------------------------------------
const frozen = freeze([124, 302, 148, 126, 170, 104]);

check('колонка получает новую ширину', setWidth(frozen, 2, 220)[2], '220px');
check('соседи не двигаются',
    [setWidth(frozen, 2, 220)[1], setWidth(frozen, 2, 220)[3]], ['302px', '126px']);
check('исходный список не меняется — его держит React', frozen[2], '148px');
check('несуществующая колонка ничего не портит', setWidth(frozen, 99, 220), frozen);
check('отрицательный номер тоже', setWidth(frozen, -1, 220), frozen);

//--- возврат к задуманному --------------------------------------------------
const defaults = parseTracks(GRID);

check('колонке возвращается дорожка из кода страницы',
    restoreTrack(setWidth(frozen, 1, 400), defaults, 1)[1], 'minmax(230px, 2.2fr)');
check('остальные остаются такими, как их выставили',
    restoreTrack(setWidth(frozen, 1, 400), defaults, 1)[2], '148px');

//--- сохранённое против сегодняшнего ----------------------------------------
//человек добавил свою колонку — старые ширины относились к другому набору.
//Подгонять их бессмысленно: честнее показать таблицу, как она задумана
check('набор той же длины принимается', reconcile(frozen, defaults), frozen);
check('колонок стало больше — берём сегодняшние',
    reconcile(frozen, [...defaults, '120px']).length, 7);
check('колонок стало меньше — тоже', reconcile(frozen, defaults.slice(0, 3)).length, 3);
check('ничего не сохранено — сегодняшние', reconcile(null, defaults), defaults);
check('в сохранённом мусор — сегодняшние', reconcile(['124px', 42, null, '', 'x', 'y'], defaults), defaults);

//--- хранилище, которого может не быть --------------------------------------
//приватное окно, запрет хранилища, сервер. Ширина колонок не то, ради чего
//можно уронить страницу
const fake = (() => {
    const box = new Map();
    return {
        getItem: (k) => box.get(k) ?? null,
        setItem: (k, v) => box.set(k, v),
        removeItem: (k) => box.delete(k),
        has: (k) => box.has(k),
    };
})();

writeStored(fake, frozen);
check('записанное читается обратно', readStored(fake), frozen);
check('и лежит под своим ключом', fake.has(STORAGE_KEY), true);

writeStored(fake, null);
check('сброс убирает запись', readStored(fake), null);

check('без хранилища чтение возвращает пустоту, а не падает', readStored(undefined), null);
check('битый JSON — тоже пустота',
    readStored({ getItem: () => '{не json' }), null);

const angry = { setItem: () => { throw new Error('quota'); } };
writeStored(angry, frozen);
check('хранилище отказало при записи — страница живёт дальше', true, true);

done();
