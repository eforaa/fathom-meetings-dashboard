// One person must appear once per meeting, whatever Fathom called them.
//
// Fixtures below are the two shapes seen in the live table:
//   A. the same display name twice — once carrying an address, once not
//      (Fathom's calendar invitee vs the transcript speaker)
//   B. a row whose *name* is an address, alongside the same human's real name
//
// Run: node tests/people-dedupe.mjs   (no database, no env needed)
import { peopleByMeeting, MANUAL_ALIASES } from '../lib/people.js';
import { check, done } from './_check.mjs';


const meetings = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
const participants = new Map([
    // A: one human, two rows
    ['m1', [
        { id: 1, name: 'Daniil Soloviov', email: 'd.soloviov@aivocado.ai' },
        { id: 2, name: 'Daniil Soloviov', email: null },
        { id: 3, name: 'Sofiia Vedenieva', email: null },
    ]],
    // B: the same human under a real name and under a bare address
    ['m2', [
        { id: 4, name: 'Тетяна Гуль', email: null },
        { id: 5, name: 't.gul@aivocado.ai', email: null },
    ]],
    // two different people whose surnames rhyme must stay apart
    ['m3', [
        { id: 6, name: 'Александр Погорелый', email: null },
        { id: 7, name: 'Nastya Pogorelaya', email: null },
    ]],
]);

const byMeeting = peopleByMeeting(meetings, participants);
const labels = (id) => (byMeeting.get(id) ?? []).map((p) => p.name).sort();

check('A. one row per human in a meeting', labels('m1'), ['Daniil Soloviov', 'Sofiia Vedenieva']);
check('B. a bare address folds into the real name', labels('m2'), ['Тетяна Гуль']);
check('different people stay separate', labels('m3'), ['Nastya Pogorelaya', 'Александр Погорелый']);

const ids = (byMeeting.get('m1') ?? []).map((p) => p.id);
check('each person carries one stable id', ids.length, new Set(ids).size);

//--- список, подтверждённый человеком ---------------------------------------
//Две пары машина связать не может: «Nastya» и «a.pogorelaya» — разные части
//имени, «Soloviov» и «Solovyov» — разное написание фамилии. Угадывать нельзя,
//поэтому они внесены руками, и вот проверка, что список действительно
//работает — и что он не склеивает лишнего.
const manual = peopleByMeeting(
    [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    new Map([
        ['a1', [
            { id: 10, name: 'Nastya Pogorelaya', email: null },
            { id: 11, name: null, email: 'a.pogorelaya@aivocado.ai' },
        ]],
        ['a2', [
            { id: 12, name: 'Daniil Soloviov', email: null },
            { id: 13, name: 'Danila Solovyov', email: null },
            { id: 14, name: null, email: 'd.solovyov@privilegija.ua' },
        ]],
        //однофамилец, которого в списке нет, обязан остаться отдельным
        ['a3', [
            { id: 15, name: 'Александр Погорелый', email: null },
            { id: 16, name: null, email: 'a.pogorelaya@aivocado.ai' },
        ]],
    ]),
);

const names = (id) => (manual.get(id) ?? []).map((p) => p.name).sort();

check('имя и адрес из списка — один человек', names('a1').length, 1);
check('и показывается человеческим именем', names('a1'), ['Nastya Pogorelaya']);
check('три записи Даниила сходятся в одну', names('a2').length, 1);
check('однофамилец в список не попадает', names('a3').length, 2);

//сам список должен оставаться читаемым: пары, а не свалка
check('в списке только пары', MANUAL_ALIASES.every((pair) => pair.length === 2), true);
check('обе стороны — непустые строки',
    MANUAL_ALIASES.every((pair) => pair.every((v) => typeof v === 'string' && v.trim())), true);

done();
