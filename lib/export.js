//Выгрузка списка встреч в файл: таблицей (CSV) и текстом (Markdown).
//
//Здесь только превращение строк в текст — ни базы, ни запроса. Проверять надо
//именно это: почти вся боль выгрузки живёт в экранировании. Конспект встречи
//содержит запятые, кавычки и переносы строк; имя человека — запятую перед
//фамилией; название — вертикальную черту. Каждый из этих символов способен
//незаметно развалить файл так, что он откроется, но со сдвинутыми колонками.

//сколько строк отдаём за раз. Список на экране столько не бывает, а вот
//запрос, посланный в цикле, бывает
export const MAX_EXPORT = 2000;

const BOM = '﻿';

//CSV разделяет строки парой CR+LF. Не украшение: Excel на Windows читает
//одиночный перевод строки внутри поля как конец записи
const CRLF = '\r\n';

//--- CSV --------------------------------------------------------------------
//Правило простое и старое (RFC 4180): поле берётся в кавычки, если содержит
//разделитель, кавычку или перевод строки; кавычка внутри удваивается.
export function csvCell(value) {
    const text = value == null ? '' : String(value);

    if (!/[",\r\n;]/.test(text)) return text;

    return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows, columns) {
    const head = columns.map((column) => csvCell(column.title)).join(',');
    const body = rows.map((row) =>
        columns.map((column) => csvCell(column.value(row))).join(','),
    );

    //BOM в начале — единственный способ объяснить Excel, что файл в UTF-8.
    //Без него кириллица открывается кракозябрами, и человек решает, что
    //выгрузка сломана
    return BOM + [head, ...body].join(CRLF) + CRLF;
}

//--- Markdown ---------------------------------------------------------------
//Вертикальная черта — разделитель колонок, поэтому внутри ячейки её надо
//экранировать. Перенос строки в таблице Markdown невозможен вовсе: строка
//таблицы — это одна строка текста, и любой перенос разорвал бы её.
export function mdCell(value) {
    const text = value == null ? '' : String(value);

    return text
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ');
}

export function toMarkdown(rows, columns, { title } = {}) {
    const head = `| ${columns.map((c) => mdCell(c.title)).join(' | ')} |`;
    //двоеточие справа выравнивает числовые колонки по правому краю
    const rule = `| ${columns.map((c) => (c.numeric ? '---:' : '---')).join(' | ')} |`;
    const body = rows.map(
        (row) => `| ${columns.map((c) => mdCell(c.value(row))).join(' | ')} |`,
    );

    const lines = [];
    if (title) lines.push(`# ${title}`, '');
    lines.push(head, rule, ...body, '');

    return lines.join('\n');
}

//--- имя файла --------------------------------------------------------------
//Файл ложится в папку загрузок рядом с десятком других, поэтому в имени
//стоит промежуток дат: «встречи-2026-08-01…2026-08-19.csv» через месяц
//объяснит себя сам, а «meetings.csv» — нет.
export function fileName({ from, to, format, stamp }) {
    const parts = ['meetings'];

    if (from && to && from === to) parts.push(from);
    else if (from && to) parts.push(`${from}_${to}`);
    else if (from) parts.push(`from-${from}`);
    else if (to) parts.push(`to-${to}`);
    else if (stamp) parts.push(stamp);

    return `${parts.join('-')}.${format === 'md' ? 'md' : 'csv'}`;
}

export const MIME = {
    csv: 'text/csv; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
};
