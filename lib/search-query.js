//What someone typed, turned into something Postgres can look up in an index.
//
//Kept away from the database so the rule can be read and tested on its own —
//and because it is the piece most likely to be wrong in a way nobody notices:
//a query that quietly matches nothing looks exactly like "no such meetings".

//Postgres gives tsquery its own little syntax — & | ! : * ( ) — and a stray
//one of those from a search box is a syntax error, not a search. So the words
//are taken out and the query is built, rather than the text being passed
//through with the dangerous characters removed.
//
//Every word must be present (&), and the words are open-ended (:*) so typing
//"fath" still finds "fathom", the way the old substring search did. Postgres
//matches whole words otherwise, and half of what people type is half a word.
export function toTsQuery(raw) {
    const words = String(raw ?? '')
        .toLowerCase()
        //letters and digits of any alphabet: the meetings are in three
        .match(/[\p{L}\p{N}_]+/gu);

    if (!words?.length) return '';

    return words.map((word) => `${word}:*`).join(' & ');
}

//The database says the column is missing in the same way every time, and that
//is the one error we answer by falling back instead of failing: it means
//db/search-index.sql has not been applied yet.
export function isMissingSearchColumn(message) {
    const text = String(message ?? '');
    return text.includes('search_doc') || text.includes('42703');
}


//Тот же запрос, но для запасного пути — подстроки через ILIKE.
//
//Здесь текст не передаётся в параметр, а склеивается в строку фильтра
//PostgREST вида `title.ilike.%слово%,ai_title.ilike.%слово%`. Значит,
//символы этой грамматики — запятая, точка, скобки, кавычки, двоеточие,
//звёздочка — из пользовательского ввода в неё попадать не должны: набранное
//в поиске `x.ilike.*` дописывало бы к фильтру собственное условие. До SQL это
//не доходит (PostgREST — не конкатенация в SQL), но условие отбора всё равно
//сочиняет посторонний.
//
//Поэтому не «вырезаем опасное», а оставляем разрешённое: буквы и цифры любого
//алфавита, пробел, дефис, подчёркивание, собака и точка.
//
//Точка остаётся намеренно. Без неё поиск по адресу перестал бы работать
//совсем: «anna@example.com» превратилось бы в «anna@example com» и не нашло
//бы ничего. Новое условие точкой не создать — условия разделяются запятой,
//а её здесь как раз нет.
export function safeLike(raw) {
    return String(raw ?? '')
        .replace(/[^\p{L}\p{N}_@.\-\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
