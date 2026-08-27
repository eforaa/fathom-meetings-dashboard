import { NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { db } from '@/lib/supabase';
import { rateLimit, GUESSING } from '@/lib/rate-limit';
import { backupName, toNdjson, stripSecrets, expired, columnsToKeep, BUCKET } from '@/lib/backup';

export const dynamic = 'force-dynamic';
//копия читает всю базу; шестидесяти секунд Vercel на это хватает с запасом,
//но брать меньше нельзя
export const maxDuration = 60;

//Резервная копия базы — раз в сутки, в хранилище того же проекта Supabase.
//
//Одно хранилище с базой — это не идеал: пожар в дата-центре унесёт и то, и
//другое. Но это защищает от того, что случается на порядок чаще: неудачного
//`delete`, сломанной миграции, чужой руки в SQL Editor. Копия, которой нет,
//не спасает ни от чего.
//
//Файл — ndjson.gz: по строке на запись, сжатый. Восстановление читается
//построчно, переживает обрыв и не требует держать всю базу в памяти.

//что копируем. Порядок важен: при восстановлении встречи должны появиться
//раньше участников, иначе внешние ключи не сойдутся
const TABLES = ['fathom_accounts', 'custom_columns', 'meetings', 'participants', 'sync_runs'];

const PAGE = 1000;

//отсутствующая таблица — это не поломка: sync_runs появилась вчера, а
//archived сегодня. Всё остальное — поломка, и молчать о ней нельзя
const missingTable = (message) =>
    /does not exist|schema cache|could not find the table/i.test(String(message ?? ''));

async function dump(table, options) {
    //какие колонки брать, решает живая строка: запрашивать `*` нельзя — в
    //meetings приедут расшифровки и служебная search_doc, и запрос отвалится
    //по таймауту базы. Проверено: с ними тысяча строк не проходит вовсе
    const probe = await db.from(table).select('*').limit(1);

    if (probe.error) {
        if (missingTable(probe.error.message)) {
            console.warn(`backup: ${table} — нет такой таблицы, пропускаю`);
            return { text: '', rows: 0, skipped: true };
        }
        throw new Error(`${table}: ${probe.error.message}`);
    }

    const columns = columnsToKeep(probe.data?.[0], table, options);
    //пустая таблица: колонок не видно, но и копировать нечего
    if (!columns.length) return { text: '', rows: 0, skipped: false };

    const parts = [];
    let rows = 0;

    for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
            .from(table)
            .select(columns.join(', '))
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);

        //Здесь молчать нельзя. Копия, тихо потерявшая таблицу встреч, выглядит
        //удачной и не стоит ничего — ровно это и случилось на первом прогоне,
        //когда запрос отвалился по таймауту, а копия отрапортовала «готово»
        if (error) throw new Error(`${table}: ${error.message}`);

        if (!data.length) break;

        parts.push(toNdjson(table, data.map((row) => stripSecrets(table, row, options))));
        rows += data.length;

        if (data.length < PAGE) break;
    }

    return { text: parts.join(''), rows, skipped: false };
}

export async function POST(request) {
    return run(request);
}

export async function GET(request) {
    return run(request);
}

async function run(request) {
    //секрет проверяется ДО счётчика попыток: счётчик висит на подделываемом
    //заголовке, и чужой мог бы исчерпать его и не пустить настоящую копию
    const secret = process.env.CRON_SECRET;

    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        const tooMany = rateLimit(request, { bucket: 'backup', identity: null, ...GUESSING });
        if (tooMany) return tooMany;

        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const started = Date.now();
    const counts = {};
    const chunks = [];

    //?transcripts=1 — полная копия, вручную и не по расписанию: расшифровки
    //весят 45 МБ и в минуту Vercel не укладываются
    const options = { transcripts: new URL(request.url).searchParams.get('transcripts') === '1' };

    try {
        for (const table of TABLES) {
            const part = await dump(table, options);
            if (part.skipped) continue;

            counts[table] = part.rows;
            chunks.push(part.text);
        }
    } catch (caught) {
        //неполная копия не сохраняется вовсе: файл, в котором нет встреч,
        //опаснее отсутствия файла — на него понадеются
        console.error('backup failed:', caught.message);
        return NextResponse.json({ ok: false, error: caught.message }, { status: 500 });
    }

    const packed = gzipSync(Buffer.from(chunks.join(''), 'utf8'));
    const name = backupName(new Date().toISOString());

    //хранилище заводится при первом запуске: приватное, чтобы копия не была
    //доступна по прямой ссылке никому, кроме служебного ключа
    await db.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    const { error: failed } = await db.storage
        .from(BUCKET)
        .upload(name, packed, { contentType: 'application/gzip', upsert: true });

    if (failed) {
        console.error('backup upload failed:', failed.message);
        return NextResponse.json({ ok: false, error: failed.message }, { status: 500 });
    }

    //чистка старых копий — после успешной записи новой, никогда до неё
    const { data: files } = await db.storage.from(BUCKET).list('', { limit: 1000 });
    const stale = expired((files ?? []).map((file) => file.name));
    if (stale.length) await db.storage.from(BUCKET).remove(stale);

    return NextResponse.json({
        ok: true,
        file: name,
        bytes: packed.length,
        rows: counts,
        transcripts: options.transcripts,
        removed: stale,
        ms: Date.now() - started,
    });
}
