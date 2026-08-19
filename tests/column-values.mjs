// What a custom column accepts into a cell.
//
// Two very different callers write here: the interface, which sends clean
// values from its own pickers, and Claude through the connector, which sends
// whatever the conversation produced — a number as text, a tag list as
// "a, b", a value the column never offered. coerceValue is the one place that
// decides, so an invented option cannot reach the table.
import { coerceValue, COLUMN_TYPES } from '../lib/column-types.js';
import { check, done } from './_check.mjs';

const col = (type, options) => ({ type, options });

// --- number ----------------------------------------------------------------
check('a number arrives as a number', coerceValue(col('number'), 42), 42);
check('a number written as text is understood', coerceValue(col('number'), '42'), 42);
check('a decimal survives', coerceValue(col('number'), '3.5'), 3.5);
check('an empty cell is empty, not zero', coerceValue(col('number'), ''), null);
check('words are not a number', coerceValue(col('number'), 'сорок два'), null);
check('infinity is not a number either', coerceValue(col('number'), Infinity), null);

// --- checkbox --------------------------------------------------------------
check('a tick from the interface', coerceValue(col('checkbox'), true), true);
check('a tick written as text, the way Claude sends it', coerceValue(col('checkbox'), 'true'), true);
check('unticked is empty rather than false, so the cell stays blank',
    coerceValue(col('checkbox'), false), null);

// --- select ----------------------------------------------------------------
const status = col('select', ['Готово', 'В работе']);
check('an offered value is kept', coerceValue(status, 'Готово'), 'Готово');
check('surrounding spaces are trimmed', coerceValue(status, '  Готово  '), 'Готово');
check('a value the column never offered is refused — this is the invented-option guard',
    coerceValue(status, 'Почти готово'), null);
check('an empty choice clears the cell', coerceValue(status, ''), null);

// --- multiselect -----------------------------------------------------------
const tags = col('multiselect', ['a', 'b', 'c']);
check('a list from the interface', coerceValue(tags, ['a', 'b']), ['a', 'b']);
check('a comma string from Claude becomes a list', coerceValue(tags, 'a, b'), ['a', 'b']);
check('a tilde string works too', coerceValue(tags, 'a~c'), ['a', 'c']);
check('unknown entries are dropped, known ones kept', coerceValue(tags, ['a', 'zzz']), ['a']);
check('a repeat is not stored twice', coerceValue(tags, ['a', 'a', 'b']), ['a', 'b']);
check('nothing recognised leaves the cell empty', coerceValue(tags, ['zzz']), null);

// --- text ------------------------------------------------------------------
check('text is trimmed', coerceValue(col('text'), '  привет  '), 'привет');
check('empty text clears the cell', coerceValue(col('text'), '   '), null);
check('a very long note is cut to 500 characters',
    coerceValue(col('text'), 'я'.repeat(1000)).length, 500);
check('a number in a text column becomes its text', coerceValue(col('text'), 7), '7');

// --- every type the app offers has a rule ----------------------------------
check('no column type falls through without being handled',
    COLUMN_TYPES.filter((type) => coerceValue(col(type, ['x']), undefined) !== null), []);

done();
