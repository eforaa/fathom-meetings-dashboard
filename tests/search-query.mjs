// Turning a search box into a database query.
//
// This is the piece most likely to be wrong in a way nobody notices: a query
// that matches nothing looks exactly like "there are no such meetings". And it
// is the piece a stranger's text reaches first, so the special characters of
// tsquery syntax must never survive it.
import { toTsQuery, isMissingSearchColumn, safeLike } from '../lib/search-query.js';
import { check, done } from './_check.mjs';

// --- ordinary words ---------------------------------------------------------
check('one word becomes an open-ended term, so "fath" still finds "fathom"',
    toTsQuery('fathom'), 'fathom:*');
check('several words must all be present',
    toTsQuery('встреча с клиентом'), 'встреча:* & с:* & клиентом:*');
check('case does not matter', toTsQuery('Клиент'), 'клиент:*');
check('extra spaces are not words', toTsQuery('  клиент   встреча  '), 'клиент:* & встреча:*');
check('digits count as a word', toTsQuery('M-01'), 'm:* & 01:*');

// --- three alphabets --------------------------------------------------------
check('cyrillic survives', toTsQuery('архітектура'), 'архітектура:*');
check('latin and cyrillic in one query',
    toTsQuery('Fathom база'), 'fathom:* & база:*');

// --- the syntax of tsquery must never come from the search box --------------
check('an ampersand is not an operator here', toTsQuery('a & b'), 'a:* & b:*');
check('a pipe is not an operator either', toTsQuery('a | b'), 'a:* & b:*');
check('a negation cannot be typed in', toTsQuery('!клиент'), 'клиент:*');
check('a stray colon-star does not double up', toTsQuery('клиент:*'), 'клиент:*');
check('brackets are dropped', toTsQuery('(клиент)'), 'клиент:*');
check('a lone quote does not break the query', toTsQuery("it's"), 'it:* & s:*');

// --- nothing to search for --------------------------------------------------
check('punctuation alone is not a search', toTsQuery('!!!'), '');
check('an empty box is not a search', toTsQuery(''), '');
check('a missing value is not a search', toTsQuery(null), '');

// --- knowing when the index is not there yet --------------------------------
check('the column-missing error is recognised',
    isMissingSearchColumn('column meetings.search_doc does not exist'), true);
check('so is the postgres code for it', isMissingSearchColumn('42703'), true);
check('an unrelated failure is not mistaken for it',
    isMissingSearchColumn('connection refused'), false);
check('and neither is nothing at all', isMissingSearchColumn(undefined), false);

// --- запасной путь: подстрока через ILIKE ----------------------------------
// Здесь текст склеивается в строку фильтра PostgREST вида
// `title.ilike.%слово%,ai_title.ilike.%слово%`, поэтому символы этой
// грамматики из пользовательского ввода в неё попадать не должны: набранное в
// поиске `x.ilike.*` дописывало бы собственное условие отбора.
check('обычное слово проходит целиком', safeLike('клиент'), 'клиент');
check('адрес не ломается: точка и собака нужны',
    safeLike('anna@example.com'), 'anna@example.com');
check('дефис и подчёркивание остаются', safeLike('ai-vocado_1'), 'ai-vocado_1');

// запятая — разделитель условий, без неё нового условия не создать
check('запятая не доезжает до фильтра', safeLike('a,b').includes(','), false);
check('скобки тоже', safeLike('a(b)c').includes('('), false);
check('кавычки и точка с запятой', safeLike(`ta'; DROP--`).includes("'"), false);
check('звёздочка и процент — знаки шаблона, не текста',
    safeLike('%a*b%'), 'a b');
check('попытка дописать условие остаётся текстом',
    safeLike("ta'; DROP-- .ilike.*"), 'ta DROP-- .ilike.');
check('несколько пробелов схлопываются', safeLike('a    b'), 'a b');
check('пусто на входе — пусто на выходе', safeLike(null), '');

done();
