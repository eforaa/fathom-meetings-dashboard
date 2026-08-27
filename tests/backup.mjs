// Резервная копия базы: имена, содержимое, чистка.
//
// Самая опасная часть здесь — не запись, а удаление старых копий. Ошибка в
// нём стирает ровно то, ради чего копии и заводились, и замечают это в тот
// единственный день, когда копия нужна.
import {
    backupName, toNdjson, stripSecrets, expired, columnsToKeep, skipFor,
    KEEP, SKIP_COLUMNS, WITHOUT_TRANSCRIPTS,
} from '../lib/backup.js';
import { check, done } from './_check.mjs';

//--- имя файла --------------------------------------------------------------
check('имя — это дата с точностью до минуты',
    backupName('2026-08-20T17:05:33.000Z'), '2026-08-20-17-05.ndjson.gz');
//двоеточий в именах файлов лучше не иметь: Windows их не принимает вовсе
check('двоеточий в имени нет', backupName('2026-08-20T17:05:33.000Z').includes(':'), false);
check('мусор вместо даты — понятная ошибка, а не файл «Invalid Date»', (() => {
    try { backupName('позавчера'); return 'создалось'; } catch { return 'отказ'; }
})(), 'отказ');

//имена обязаны сортироваться как время — на этом держится вся чистка
const names = [
    backupName('2026-08-18T03:00:00Z'),
    backupName('2026-08-20T03:00:00Z'),
    backupName('2026-08-19T03:00:00Z'),
];
check('сортировка строк совпадает с порядком времени',
    [...names].sort(), [names[0], names[2], names[1]]);

//--- содержимое -------------------------------------------------------------
const rows = [{ id: 1, title: 'Планёрка' }, { id: 2, title: 'Разговор с «Ромашкой»' }];
const text = toNdjson('meetings', rows);

check('строка на запись, а не один общий массив', text.trimEnd().split('\n').length, 2);
check('каждая строка — самостоятельный JSON',
    JSON.parse(text.split('\n')[0]).row.title, 'Планёрка');
check('таблица записана рядом со строкой',
    JSON.parse(text.split('\n')[0]).table, 'meetings');
check('кириллица переживает запись',
    JSON.parse(text.split('\n')[1]).row.title, 'Разговор с «Ромашкой»');
//перенос строки внутри значения не должен разрывать запись на две
check('перенос внутри поля не ломает построчность',
    toNdjson('meetings', [{ summary: 'первая\nвторая' }]).trimEnd().split('\n').length, 1);
check('пустая таблица — пустой кусок', toNdjson('meetings', []), '');

//--- секреты ----------------------------------------------------------------
//зашифрованный ключ остаётся в базе: восстановиться без него можно (вставить
//заново — минута), а файл с ключами лежал бы там же, куда доберётся тот, кто
//однажды доберётся до хранилища
const account = { user_email: 'a@b.io', api_key_encrypted: 'iv:tag:secret', api_key_hint: '1234' };

check('ключ в копию не попадает',
    'api_key_encrypted' in stripSecrets('fathom_accounts', account), false);
check('всё остальное остаётся', stripSecrets('fathom_accounts', account).api_key_hint, '1234');
check('исходная строка не меняется', account.api_key_encrypted, 'iv:tag:secret');
check('таблицы без секретов проходят как есть',
    stripSecrets('meetings', { id: 1 }), { id: 1 });
//список исключений виден целиком: секрет у аккаунтов и вычисляемая колонка
//поиска у встреч. Больше из копии не выпадает ничего
check('список исключений назван явно',
    Object.keys(SKIP_COLUMNS), ['fathom_accounts', 'meetings']);
check('у встреч исключается только вычисляемое', SKIP_COLUMNS.meetings, ['search_doc']);

//--- какие колонки вообще запрашивать ---------------------------------------
//Запрашивать `*` у встреч нельзя, и это не вкусовщина: в ответ приезжают
//расшифровки и служебная search_doc, и тысяча строк не проходит по таймауту
//базы. Проверено на живой базе — первый прогон копии молча потерял ВСЕ встречи
//именно так, отрапортовав при этом «готово».
const sample = {
    id: 1, title: 'Планёрка', raw_transcript: 'много текста',
    search_doc: "'планерка':1", importance: 3,
};

check('расшифровка и служебная колонка не запрашиваются',
    columnsToKeep(sample, 'meetings'), ['id', 'title', 'importance']);
check('с явной просьбой расшифровка возвращается',
    columnsToKeep(sample, 'meetings', { transcripts: true }),
    ['id', 'title', 'raw_transcript', 'importance']);
//search_doc не возвращается никогда: она вычисляемая и соберётся сама
check('но служебная колонка — никогда',
    columnsToKeep(sample, 'meetings', { transcripts: true }).includes('search_doc'), false);
check('у таблицы без исключений берутся все колонки',
    columnsToKeep({ a: 1, b: 2 }, 'sync_runs'), ['a', 'b']);
check('пустая таблица — пустой список колонок', columnsToKeep(null, 'meetings'), []);

check('расшифровки названы отдельно от секретов',
    WITHOUT_TRANSCRIPTS.meetings, ['raw_transcript']);
check('в ежедневной копии их нет',
    skipFor('meetings').includes('raw_transcript'), true);
check('ключ выпадает при любом режиме',
    skipFor('fathom_accounts', { transcripts: true }), ['api_key_encrypted']);

//--- чистка -----------------------------------------------------------------
const week = Array.from({ length: 10 }, (_, i) =>
    backupName(`2026-08-${String(10 + i).padStart(2, '0')}T03:00:00Z`));

check('свежие KEEP остаются', expired(week).length, week.length - KEEP);
//порядок удаления значения не имеет — важно, ЧТО удаляется
check('удаляются именно старые', [...expired(week)].sort(), week.slice(0, 3));
check('копий меньше предела — удалять нечего', expired(week.slice(0, 3)), []);
check('ровно предел — тоже', expired(week.slice(0, KEEP)), []);

//чужие файлы в том же хранилище не наше дело: удалять то, чего мы не
//создавали, нельзя ни при каком счёте
check('чужие имена не трогаются',
    expired([...week, 'важное.zip', 'export.csv']).includes('важное.zip'), false);
check('и в счёт наших не идут',
    expired(['важное.zip', 'export.csv', ...week.slice(0, 2)]), []);
check('пустое хранилище — пустой список', expired([]), []);
check('глубину можно задать', expired(week, 2).length, week.length - 2);

done();
