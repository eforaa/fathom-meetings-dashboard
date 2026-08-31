// Перенос склейки людей из памяти в базу.
//
//   node tools/people-sync.mjs           — только отчёт, ничего не пишет
//   node tools/people-sync.mjs --write   — записать людей и проставить ссылки
//
// Правила склейки остаются в lib/people.js — они сложные (union-find плюс
// транслитерация плюс список, подтверждённый человеком), и держать их в SQL
// значило бы переписать заново на другом языке. Здесь только перенос
// результата: посчитали кодом, положили в таблицу.
//
// Запускать можно сколько угодно раз: люди узнаются по ключу и обновляются,
// а не добавляются второй раз.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { peopleByRow } from '../lib/people.js';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const found = line.match(/^﻿?([A-Z_]+)=(.*)$/);
    if (found && !process.env[found[1]]) process.env[found[1]] = found[2].trim();
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});

const write = process.argv.includes('--write');
const say = (...parts) => console.log(...parts);

//--- всё, что есть -----------------------------------------------------------
const page = async (table, columns) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(table).select(columns).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
    }
    return rows;
};

const meetings = await page('meetings', 'id');
const participants = await page('participants', 'id, meeting_id, name, email, identity');

const byMeeting = new Map();
for (const row of participants) {
    const list = byMeeting.get(row.meeting_id) ?? [];
    list.push(row);
    byMeeting.set(row.meeting_id, list);
}

say(`встреч: ${meetings.length} · строк участников: ${participants.length}`);

//--- кто есть кто ------------------------------------------------------------
//строка → человек берётся из lib/people.js, а не угадывается сравнением имён:
//у склеенного человека адресов несколько, показывается один, и строки со
//вторым адресом при сравнении терялись — 394 из 5609 на первой попытке
const perRow = peopleByRow(meetings, byMeeting);

const people = new Map();
for (const [rowId, person] of perRow) {
    const found = people.get(person.id) ?? {
        key: person.id, label: person.name, emails: new Set(), names: new Set(), rows: [],
    };
    if (person.email) found.emails.add(person.email);
    found.names.add(person.name);
    found.rows.push(rowId);
    people.set(person.id, found);
}

//все написания имени и все адреса — из самих строк, а не только из показанного
for (const row of participants) {
    const person = perRow.get(row.id);
    if (!person) continue;
    const found = people.get(person.id);
    if (row.email) found.emails.add(row.email);
    if (row.name) found.names.add(row.name);
}

const sorted = [...people.values()].sort((a, b) => b.rows.length - a.rows.length);

say(`людей после склейки: ${sorted.length}`);
say('\nсамые частые:');
for (const person of sorted.slice(0, 8)) {
    say(`  ${String(person.rows.length).padStart(5)}  ${person.label}  ${[...person.emails].join(' · ')}`);
}

const noRow = participants.length - sorted.reduce((n, person) => n + person.rows.length, 0);
if (noRow) say(`\nстрок без человека: ${noRow} (нет ни имени, ни адреса)`);

if (!write) {
    say('\nничего не записано. Чтобы записать: node tools/people-sync.mjs --write');
    process.exit(0);
}

//--- запись ------------------------------------------------------------------
say('\nзапись людей…');
const rowsToWrite = sorted.map((person) => ({
    key: person.key,
    label: person.label,
    emails: [...person.emails],
    names: [...person.names],
    updated_at: new Date().toISOString(),
}));

for (let from = 0; from < rowsToWrite.length; from += 500) {
    const { error } = await db
        .from('people')
        .upsert(rowsToWrite.slice(from, from + 500), { onConflict: 'key' });
    if (error) { console.error('people:', error.message); process.exit(1); }
}

//узнаём выданные id и проставляем их участникам
const { data: stored, error: readFailed } = await db.from('people').select('id, key');
if (readFailed) { console.error('people:', readFailed.message); process.exit(1); }

const idByKey = new Map(stored.map((row) => [row.key, row.id]));
let linked = 0;

say('простановка ссылок…');
for (const person of sorted) {
    const personId = idByKey.get(person.key);
    if (!personId || !person.rows.length) continue;

    //строк у одного человека бывают тысячи — пишем пачками
    for (let from = 0; from < person.rows.length; from += 500) {
        const chunk = person.rows.slice(from, from + 500);
        const { error } = await db
            .from('participants')
            .update({ person_id: personId })
            .in('id', chunk);

        if (error) { console.error('participants:', error.message); process.exit(1); }
        linked += chunk.length;
    }
}

say(`\nготово: людей ${rowsToWrite.length}, строк связано ${linked}`);
