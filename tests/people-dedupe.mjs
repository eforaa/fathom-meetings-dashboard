// One person must appear once per meeting, whatever Fathom called them.
//
// Fixtures below are the two shapes seen in the live table:
//   A. the same display name twice — once carrying an address, once not
//      (Fathom's calendar invitee vs the transcript speaker)
//   B. a row whose *name* is an address, alongside the same human's real name
//
// Run: node tests/people-dedupe.mjs   (no database, no env needed)
import { peopleByMeeting } from '../lib/people.js';
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

done();
