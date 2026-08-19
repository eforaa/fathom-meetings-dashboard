// Which name, which types, which summary a meeting shows.
//
// A meeting carries up to four names: the calendar one Fathom recorded, the
// short one Fathom derived from the purpose line, one an analysis generated,
// and one a person typed. The rule that picks between them is the most
// quietly consequential thing in the app — get it wrong and an analysis
// silently overwrites a real calendar name on 222 rows.
import {
    meetingTitle, meetingTitleSource, meetingOriginalTitle, meetingTypes,
    meetingSummary, formatDuration, initials, MEETING_TYPES,
} from '../lib/format.js';
import { check, done } from './_check.mjs';

const pin = (choice) => ({ custom_fields: { __title_choice: choice } });

// --- which name shows ------------------------------------------------------
check('a typed name wins over everything',
    meetingTitle({ custom_title: 'Мой', title: 'Real', ai_title: 'AI', fathom_title: 'F' }),
    'Мой');

check('a real calendar name outranks a generated one — analysis must not overwrite it',
    meetingTitle({ title: 'Weekly sync', ai_title: 'Обсуждение архитектуры' }),
    'Weekly sync');

check('a generated name outranks the purpose line',
    meetingTitle({ ai_title: 'AI name', fathom_title: 'Purpose' }),
    'AI name');

check('with nothing to show, the marker says so',
    meetingTitle({}, 'en'), 'No name');

// --- placeholders are not names --------------------------------------------
check('"Impromptu Zoom Meeting" is a placeholder, not a name',
    meetingTitle({ title: 'Impromptu Zoom Meeting', ai_title: 'AI name' }), 'AI name');

check('"Without name" is a placeholder too',
    meetingTitle({ title: 'Without name', fathom_title: 'Purpose' }), 'Purpose');

check('a placeholder leaves the meeting without an original name',
    meetingOriginalTitle({ title: '  Impromptu zoom meeting  ' }), null);

check('a real name comes back trimmed',
    meetingOriginalTitle({ title: '  Weekly sync  ' }), 'Weekly sync');

// --- the pin ---------------------------------------------------------------
check('pinning the original shows it over a typed name',
    meetingTitle({ ...pin('original'), custom_title: 'Мой', title: 'Real' }), 'Real');

check('pinning the original falls back to the purpose line when there is no calendar name',
    meetingTitle({ ...pin('original'), title: 'Impromptu Zoom Meeting', fathom_title: 'Purpose' }),
    'Purpose');

check('a pin pointing at an empty field falls through instead of showing nothing',
    meetingTitle({ ...pin('ai'), custom_title: 'Мой' }), 'Мой');

check('an unknown pin value is ignored',
    meetingTitle({ ...pin('nonsense'), custom_title: 'Мой', title: 'Real' }), 'Мой');

// --- the source label must agree with what is shown ------------------------
const cases = [
    { custom_title: 'Мой', title: 'Real', ai_title: 'AI' },
    { title: 'Weekly sync', ai_title: 'AI' },
    { ai_title: 'AI name' },
    { fathom_title: 'Purpose' },
    { title: 'Impromptu Zoom Meeting' },
    { ...pin('original'), custom_title: 'Мой', title: 'Real' },
    { ...pin('ai'), custom_title: 'Мой', ai_title: 'AI' },
];
const field = { custom_title: 'custom_title', title: 'title', ai_title: 'ai_title', fathom_title: 'fathom_title' };
check('the source names the field the shown title came from',
    cases.map((m) => {
        const source = meetingTitleSource(m);
        return source === 'none' ? 'none' : m[Object.keys(field).find((k) => field[k] === source)] === meetingTitle(m);
    }),
    [true, true, true, true, 'none', true, true]);

// --- types -----------------------------------------------------------------
check('the hand-picked set wins over the single analysis value',
    meetingTypes({ types: ['automation'], meeting_type: 'client_meeting' }), ['automation']);

check('an unknown type is dropped, not shown',
    meetingTypes({ types: ['automation', 'nonsense'] }), ['automation']);

check('an empty list falls back to the analysis value',
    meetingTypes({ types: [], meeting_type: 'onboarding' }), ['onboarding']);

check('no types at all is an empty list, never null',
    meetingTypes({}), []);

check('every type the picker offers is a known one',
    MEETING_TYPES.every((type) => meetingTypes({ types: [type] }).length === 1), true);

// --- summary ---------------------------------------------------------------
check('a hand-edited summary wins over the machine one',
    meetingSummary({ custom_summary: 'мой', summary: 'машинный' }), 'мой');
check('an empty summary is an empty string, not undefined',
    meetingSummary({}), '');

// --- duration --------------------------------------------------------------
check('no duration shows a dash', formatDuration(null, 'en'), '—');
check('under an hour reads in minutes', formatDuration(45, 'en'), '45 min');
check('a round hour drops the minutes', formatDuration(60, 'en'), '1 h');
check('an hour and a bit shows both', formatDuration(90, 'en'), '1 h 30 min');
check('zero is a duration, not a missing value', formatDuration(0, 'en'), '0 min');
check('the same number in russian', formatDuration(90, 'ru'), '1 ч 30 мин');

// --- initials --------------------------------------------------------------
check('initials of a two-part name', initials('Sofiia Vedenieva'), 'SV');
check('initials with nothing to work from', initials(''), '?');

done();
