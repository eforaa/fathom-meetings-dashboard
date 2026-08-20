// Что приходит от Fathom и во что мы это превращаем.
//
// Этот разбор — граница между чужими данными и нашей базой, и до сих пор он
// был без единой проверки. Ошибка здесь не падает: она записывает в базу
// правдоподобную чепуху — встречу длиной в три года, участника, размноженного
// на четверых, расшифровку, склеенную не с тем говорящим.
//
// Сети тут нет: проверяются чистые разборщики, которым payload подают руками.
import {
    transcriptToText, fathomTitle, meetingSpan, durationSeconds, extractParticipants,
} from '../lib/fathom.js';
import { check, done } from './_check.mjs';

const say = (name, text, email) => ({
    speaker: { display_name: name, matched_calendar_invitee_email: email },
    text,
});

//--- расшифровка в текст ----------------------------------------------------
const TALK = {
    transcript: [
        say('Аня', 'Привет.'),
        say('Аня', 'Начнём с задач.'),
        say('Борис', 'Готов.'),
        say('Аня', 'Тогда поехали.'),
    ],
};

//реплики одного человека подряд склеиваются в один блок, иначе расшифровка
//превращается в лестницу из «Аня:» на каждой строке
check('подряд идущие реплики одного склеиваются',
    transcriptToText(TALK).split('\n')[0], 'Аня: Привет. Начнём с задач.');
check('смена говорящего начинает новый блок',
    transcriptToText(TALK).split('\n')[1], 'Борис: Готов.');
check('тот же человек снова — снова свой блок',
    transcriptToText(TALK).split('\n').length, 3);
check('последний говорящий не теряется',
    transcriptToText(TALK).endsWith('Аня: Тогда поехали.'), true);

check('пустые реплики выбрасываются, а не превращаются в пустые блоки',
    transcriptToText({ transcript: [say('Аня', '  '), say('Аня', 'Есть.')] }),
    'Аня: Есть.');
check('говорящий без имени называется Speaker, а не undefined',
    transcriptToText({ transcript: [{ text: 'Слышно?' }] }), 'Speaker: Слышно?');
//пустая строка вместо заглушки: заглушка легла бы в базу как настоящая
//расшифровка и уехала бы в модель
check('нет расшифровки — пустая строка', transcriptToText({}), '');
check('пустой список — тоже', transcriptToText({ transcript: [] }), '');

//--- название из конспекта Fathom -------------------------------------------
const SUMMARY = [
    'Что-то до заголовка',
    '## Purpose',
    '',
    'Согласовать модель данных и роли в проекте.',
    '## Key topics',
    'Прочее',
].join('\n');

check('берётся первая строка после заголовка',
    fathomTitle(SUMMARY), 'Согласовать модель данных и роли в проекте');
check('точка в конце убирается', fathomTitle(SUMMARY).endsWith('.'), false);
check('до первого заголовка ничего не берётся',
    fathomTitle('Просто текст без заголовков'), null);
check('нет конспекта — нет названия', fathomTitle(null), null);
check('заголовок есть, а под ним пусто', fathomTitle('## Purpose\n\n'), null);

check('ссылка Markdown оставляет только текст',
    fathomTitle('## P\n[Встреча с клиентом](https://example.com)'), 'Встреча с клиентом');
check('жирный и курсив снимаются',
    fathomTitle('## P\n**Планёрка** по _проекту_'), 'Планёрка по проекту');
check('маркер списка отбрасывается', fathomTitle('## P\n- Разбор входящих'), 'Разбор входящих');
check('номер пункта тоже', fathomTitle('## P\n1. Разбор входящих'), 'Разбор входящих');

const LONG = `## P\n${'очень длинное описание встречи '.repeat(6)}`;
check('длинное название обрезается', fathomTitle(LONG).length <= 90, true);
check('и обрезка помечена многоточием', fathomTitle(LONG).endsWith('…'), true);

//--- начало, конец и длительность -------------------------------------------
const REC = {
    recording_start_time: '2026-08-19T09:00:00Z',
    recording_end_time: '2026-08-19T09:45:00Z',
    scheduled_start_time: '2026-08-19T09:00:00Z',
    scheduled_end_time: '2026-08-19T10:00:00Z',
};

//запись важнее расписания: встреча кончилась тогда, когда кончилась
check('пара записи выигрывает у пары расписания', meetingSpan(REC).seconds, 45 * 60);
check('и отдаёт свои же концы', meetingSpan(REC).end, '2026-08-19T09:45:00Z');

check('без записи берётся расписание',
    meetingSpan({
        scheduled_start_time: '2026-08-19T09:00:00Z',
        scheduled_end_time: '2026-08-19T09:30:00Z',
    }).seconds, 30 * 60);

//самая коварная ошибка: конец записи в паре с началом по расписанию даёт
//встречи длиной в годы — так выглядят демо-строки Fathom
check('половинки разных пар не смешиваются',
    meetingSpan({
        recording_end_time: '2026-08-19T09:45:00Z',
        scheduled_start_time: '2021-01-01T09:00:00Z',
    }).seconds, null);
check('встреча длиннее суток отвергается',
    meetingSpan({
        recording_start_time: '2021-01-01T09:00:00Z',
        recording_end_time: '2026-08-19T09:45:00Z',
    }).seconds, null);
check('но начало для показа всё равно сохраняется',
    meetingSpan({
        recording_start_time: '2021-01-01T09:00:00Z',
        recording_end_time: '2026-08-19T09:45:00Z',
    }).start, '2021-01-01T09:00:00Z');
check('отрицательная длительность отвергается',
    meetingSpan({
        recording_start_time: '2026-08-19T10:00:00Z',
        recording_end_time: '2026-08-19T09:00:00Z',
    }).seconds, null);
check('ничего не пришло — ничего и нет', meetingSpan({}), { start: null, end: null, seconds: null });
check('длительность — та же величина', durationSeconds(REC), 45 * 60);

//--- участники --------------------------------------------------------------
const MEETING = {
    calendar_invitees: [
        { name: 'Аня', email: 'Anya@Example.COM' },
        { name: 'Борис', email: 'boris@example.com' },
    ],
    transcript: [
        say('Аня', 'Привет', 'anya@example.com'),
        say('Гость', 'И вам'),
        say('Аня', 'Ещё раз', 'anya@example.com'),
    ],
};

const people = extractParticipants(MEETING);

check('приглашённые и говорящие сходятся в один список', people.length, 3);
//почта — ключ, и регистр в ней не значит ничего: иначе Anya@ и anya@ стали бы
//двумя людьми в одной встрече
check('почта приводится к нижнему регистру', people[0].email, 'anya@example.com');
check('тот же человек из расшифровки не удваивается',
    people.filter((p) => p.email === 'anya@example.com').length, 1);
check('говорящий без почты остаётся по имени',
    people.find((p) => p.name === 'Гость').email, null);
check('домен вынимается из почты', people[0].email_domain, 'example.com');
check('без почты нет и домена', people.find((p) => p.name === 'Гость').email_domain, null);
//Здесь два разборщика ведут себя по-разному, и это правильно: в тексте
//безымянная реплика подписывается «Speaker», а в списке участников человека
//не появляется. Выдуманный «Speaker» в участниках был бы хуже пустоты — он
//попал бы в справочник людей и в фильтры.
check('реплика без имени и почты не создаёт участника',
    extractParticipants({ transcript: [{ text: 'тишина' }] }).length, 0);
check('но в тексте расшифровки она подписана',
    transcriptToText({ transcript: [{ text: 'тишина' }] }), 'Speaker: тишина');
check('пустая встреча — пустой список', extractParticipants({}), []);

done();
