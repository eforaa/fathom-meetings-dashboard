//Восстановление из резервной копии.
//
//Копия, которую ни разу не разворачивали, — это предположение, а не
//страховка. Узнать, что файл не читается, что в нём не хватает связей или что
//записи не ложатся обратно, можно ровно в тот день, когда он нужен, — то есть
//в худший из возможных.
//
//Здесь правила разбора и проверки: ни сети, ни базы. Всё, что можно выяснить
//про копию, не трогая ничего, выясняется здесь.

//Порядок записи. Встречи должны появиться раньше участников: строка
//участника ссылается на встречу, и обратный порядок упрётся во внешний ключ.
//Аккаунты и колонки ни от кого не зависят и идут первыми.
export const RESTORE_ORDER = [
    'fathom_accounts',
    'custom_columns',
    'meetings',
    'participants',
    'sync_runs',
];

//По какому полю узнавать «ту же самую» строку. Совпало — обновляем, не
//совпало — вставляем; поэтому восстановление можно запускать дважды и трижды,
//не размножая данные.
export const CONFLICT_KEY = {
    fathom_accounts: 'user_email',
    custom_columns: 'id',
    meetings: 'id',
    participants: 'meeting_id,identity',
    sync_runs: 'id',
};

//Разбор файла. Копия — построчный JSON, и это её главное достоинство:
//испорченная строка портит одну запись, а не весь файл, и об этом можно
//сказать вслух вместо того, чтобы упасть.
export function parseBackup(text) {
    const rows = new Map();
    const broken = [];

    const lines = String(text ?? '').split('\n');

    for (const [index, line] of lines.entries()) {
        if (!line.trim()) continue;

        try {
            const { table, row } = JSON.parse(line);
            if (!table || !row || typeof row !== 'object') {
                broken.push({ line: index + 1, why: 'нет таблицы или строки' });
                continue;
            }

            if (!rows.has(table)) rows.set(table, []);
            rows.get(table).push(row);
        } catch {
            broken.push({ line: index + 1, why: 'строка не разбирается как JSON' });
        }
    }

    return { rows, broken };
}

//Связи внутри самой копии.
//
//Файл может быть цел построчно и при этом бесполезен: если участники
//ссылаются на встречи, которых в копии нет, восстановление упрётся во внешний
//ключ на первой же пачке. Это надо знать заранее, а не в процессе.
export function checkLinks({ rows }) {
    const meetings = new Set((rows.get('meetings') ?? []).map((row) => row.id));
    const orphans = (rows.get('participants') ?? [])
        .filter((row) => !meetings.has(row.meeting_id))
        .map((row) => row.meeting_id);

    return { meetings: meetings.size, orphans: [...new Set(orphans)] };
}

//Порядок и размер пачек.
//
//Пачками, потому что PostgREST не проглотит пять тысяч строк одним куском, а
//построчно — это пять тысяч запросов. Тысяча строк за раз — тот же размер, на
//котором работает чтение.
export const BATCH = 1000;

export function plan({ rows }, { batch = BATCH } = {}) {
    const steps = [];

    for (const table of RESTORE_ORDER) {
        const list = rows.get(table) ?? [];
        for (let from = 0; from < list.length; from += batch) {
            steps.push({
                table,
                onConflict: CONFLICT_KEY[table],
                rows: list.slice(from, from + batch),
            });
        }
    }

    //таблицы, которых нет в нашем порядке, не теряются молча: пусть о них
    //скажут вслух, а не выяснится через полгода
    const unknown = [...rows.keys()].filter((table) => !RESTORE_ORDER.includes(table));

    return { steps, unknown };
}

//Сравнение копии с тем, что сейчас в базе: сколько строк совпадает, сколько
//отличается, сколько исчезло. Это и есть репетиция без записи.
//
//Ключ бывает составным. У участников это пара «встреча + человек», и первая
//же репетиция показала, почему это важно: сравнение по одному meeting_id
//оставляло от встречи одного участника из пяти и объявляло 4498 строк
//«изменившимися». Инструмент проверки, который врёт, хуже отсутствия
//инструмента — на него посмотрят и успокоятся.
//разделитель — символ, которого в данных не бывает: на пробеле «a b»+«c» и
//«a»+«b c» дали бы один и тот же ключ
const keyOf = (row, parts) => parts.map((part) => String(row[part])).join('\u0000');

export function compare(fromBackup, fromDb, key = 'id') {
    const parts = String(key).split(',').map((part) => part.trim());
    const current = new Map(fromDb.map((row) => [keyOf(row, parts), row]));

    let same = 0;
    const changed = [];
    const missing = [];

    for (const row of fromBackup) {
        const id = keyOf(row, parts);
        const live = current.get(id);
        if (!live) { missing.push(row[parts[0]]); continue; }

        //сравниваем только те поля, что есть в копии: в базе могли появиться
        //новые колонки, и это не расхождение, а развитие схемы
        const differs = Object.keys(row).some(
            (column) => JSON.stringify(row[column]) !== JSON.stringify(live[column]),
        );

        if (differs) changed.push(row[parts[0]]);
        else same += 1;
    }

    return { same, changed, missing };
}
