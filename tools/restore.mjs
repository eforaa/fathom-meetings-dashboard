// Восстановление базы из резервной копии.
//
//   node tools/restore.mjs                 — последняя копия, только отчёт
//   node tools/restore.mjs --file=ИМЯ      — конкретная копия
//   node tools/restore.mjs --write         — записать в базу
//   node tools/restore.mjs --only=meetings — одна таблица
//
// По умолчанию НИЧЕГО НЕ ПИШЕТ. Инструмент, который восстанавливает базу с
// первой попытки и без предупреждения, опаснее того, от чего он спасает:
// «восстановить» можно и поверх живых данных, и в неверный проект. Поэтому
// сначала отчёт — что в копии, сходятся ли связи, чем она отличается от
// нынешней базы, — и только с --write запись.
//
// Запись идёт upsert-ом: строка узнаётся по ключу и обновляется, а не
// добавляется второй раз. Поэтому запуск дважды безопасен.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { BUCKET, columnsToKeep } from '../lib/backup.js';
import { parseBackup, checkLinks, plan, compare, CONFLICT_KEY } from '../lib/restore.js';

//переменные окружения читаются из .env.local — тем же способом, что и в
//остальных наших скриптах, чтобы не заводить отдельный порядок
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const found = line.match(/^﻿?([A-Z_]+)=(.*)$/);
    if (found && !process.env[found[1]]) process.env[found[1]] = found[2].trim();
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
    }),
);

const say = (...parts) => console.log(...parts);

//--- какую копию берём ------------------------------------------------------
const { data: files, error: listFailed } = await db.storage.from(BUCKET).list('', { limit: 1000 });
if (listFailed) {
    console.error('не удалось прочитать хранилище:', listFailed.message);
    process.exit(1);
}

const backups = files.map((file) => file.name).filter((name) => name.endsWith('.ndjson.gz')).sort();
if (!backups.length) {
    console.error('копий нет');
    process.exit(1);
}

const name = args.file ?? backups.at(-1);
say(`копия: ${name}   (всего в хранилище: ${backups.length})`);

const { data: blob, error: downloadFailed } = await db.storage.from(BUCKET).download(name);
if (downloadFailed) {
    console.error('не удалось скачать:', downloadFailed.message);
    process.exit(1);
}

const text = gunzipSync(Buffer.from(await blob.arrayBuffer())).toString('utf8');

//--- что в ней --------------------------------------------------------------
const parsed = parseBackup(text);
const links = checkLinks(parsed);
const { steps, unknown } = plan(parsed);

say('\nсодержимое:');
for (const [table, rows] of parsed.rows) say(`  ${table.padEnd(18)} ${rows.length}`);

if (parsed.broken.length) {
    say(`\nбитых строк: ${parsed.broken.length}`);
    for (const bad of parsed.broken.slice(0, 5)) say(`  строка ${bad.line}: ${bad.why}`);
}

if (links.orphans.length) {
    say(`\nучастники ссылаются на встречи, которых в копии нет: ${links.orphans.length}`);
}

if (unknown.length) say(`\nтаблицы, которые я не умею восстанавливать: ${unknown.join(', ')}`);

//--- чем копия отличается от нынешней базы ----------------------------------
say('\nсравнение с базой:');

for (const table of parsed.rows.keys()) {
    if (args.only && args.only !== table) continue;

    const key = CONFLICT_KEY[table] ?? 'id';
    const live = [];

    //Читаем теми же колонками, что и копия. `select('*')` по встречам не
    //проходит вовсе: он тянет расшифровки и служебную колонку поиска и
    //отваливается по таймауту базы. Первая репетиция именно так и сказала
    //«встреч в базе нет» — про базу, в которой их 1111
    const probe = await db.from(table).select('*').limit(1);
    const columns = columnsToKeep(probe.data?.[0], table).join(', ');

    for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(table).select(columns).range(from, from + 999);
        if (error) { say(`  ${table.padEnd(18)} прочитать не вышло: ${error.message}`); break; }
        if (!data.length) break;
        live.push(...data);
        if (data.length < 1000) break;
    }

    const seen = compare(parsed.rows.get(table), live, key);
    say(`  ${table.padEnd(18)} совпало ${seen.same} · изменилось ${seen.changed.length} · нет в базе ${seen.missing.length}`);
}

//--- запись -----------------------------------------------------------------
if (args.write !== 'true') {
    say('\nничего не записано. Чтобы записать: node tools/restore.mjs --write');
    process.exit(0);
}

say('\nзапись:');
for (const step of steps) {
    if (args.only && args.only !== step.table) continue;

    const { error } = await db
        .from(step.table)
        .upsert(step.rows, { onConflict: step.onConflict });

    if (error) {
        console.error(`  ${step.table}: ${error.message}`);
        process.exit(1);
    }

    say(`  ${step.table.padEnd(18)} ${step.rows.length}`);
}

say('\nготово');
