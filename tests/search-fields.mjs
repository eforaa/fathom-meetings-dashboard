// Какие поля участвуют в поиске.
//
// Повод настоящий, аварийный. 13 октября 2026 база ушла в ограничение по
// размеру: колонка search_doc включала расшифровку целиком, и поверх неё
// висел GIN-индекс — каждая расшифровка хранилась трижды. Владелец сказал,
// что поиском по словам ВНУТРИ расшифровок не пользуется, и расшифровки из
// индекса убраны (db/search-index-slim.sql).
//
// Но у поиска два пути: быстрый через индекс и запасной через ILIKE, когда
// индекса нет. Если убрать расшифровки только из индекса, пути начнут давать
// РАЗНЫЕ ответы на один запрос — а это хуже обоих вариантов по отдельности:
// результат зависит от того, накатана ли миграция. Плюс запасной путь
// продолжал бы читать все 45 МБ текста ровно там, где база и так задыхается.
//
// Тест держит оба списка полей одинаковыми и следит, чтобы расшифровка не
// вернулась ни в один из них.
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';

import { readFileSync } from 'node:fs';
import { check, isTrue, done } from './_check.mjs';

const queries = readFileSync('lib/queries.js', 'utf8');

//комментарии отрезаем: в шапке миграции raw_transcript упомянут в объяснении,
//и без этого проверка ловила бы собственный текст вместо определения колонки
const migration = readFileSync('db/search-index-slim.sql', 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

//поля запасного пути: строки вида `что-то.ilike.${like}` внутри .or([...])
const fallbackFields = [...queries.matchAll(/`([a-z_]+)\.ilike\.\$\{like\}`/g)]
    .map((m) => m[1]);

//поля индекса: coalesce(<поле>, '') внутри определения search_doc
const indexedFields = [...migration.matchAll(/coalesce\(([a-z_]+), ''\)/g)]
    .map((m) => m[1]);

//apply-all.sql поднимает базу с нуля — именно его накатывают на НОВЫЙ проект.
//Он тоже создаёт search_doc, и если расшифровки вернутся сюда, новая база
//повторит аварию 13.10.2026 на пустом месте. Поэтому проверяем и его.
const fromScratch = readFileSync('db/apply-all.sql', 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const scratchFields = [...fromScratch.matchAll(/coalesce\(([a-z_]+), ''\)/g)]
    .map((m) => m[1]);

// --- расшифровка не ищется нигде -------------------------------------------

isTrue(
    'запасной путь не читает расшифровки — иначе он снова перелопатит 45 МБ',
    !fallbackFields.includes('raw_transcript'),
);

isTrue(
    'индекс не хранит расшифровки — ради этого всё и затевалось',
    !indexedFields.includes('raw_transcript'),
);

isTrue(
    'и установка с нуля тоже их не хранит — иначе новый проект повторит аварию',
    !scratchFields.includes('raw_transcript'),
);

check(
    'установка с нуля создаёт ровно тот же набор полей, что и миграция',
    scratchFields,
    indexedFields,
);

// --- оба пути ищут по одному и тому же ---------------------------------------

{
    //участники ищутся отдельной таблицей, их здесь быть не должно
    const onlyIndexed = indexedFields.filter((f) => !fallbackFields.includes(f));
    const onlyFallback = fallbackFields.filter((f) => !indexedFields.includes(f));

    check('поля, которые ищет только индекс', onlyIndexed, []);
    check('поля, которые ищет только запасной путь', onlyFallback, []);
}

// --- то, ради чего поиск вообще нужен, на месте ------------------------------

for (const field of ['title', 'ai_title', 'custom_title', 'fathom_title', 'summary', 'fathom_summary']) {
    isTrue(`${field} ищется`, indexedFields.includes(field) && fallbackFields.includes(field));
}

// --- разбор остался языконезависимым ----------------------------------------

isTrue(
    "разбор 'simple': встречи на трёх языках, любой языковой испортил бы два",
    /to_tsvector\(\s*'simple'/.test(migration),
);

done();
