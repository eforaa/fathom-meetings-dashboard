// The view: what the address bar says, what gets filtered out, in what order
// the rows end up, and how the grouping tree is built.
//
// All of it runs on every page load, and all of it is driven by URL text a
// person can edit by hand — so an unknown value must be ignored, never
// followed.
import {
    readView, applySlots, applyColumnFilters, groupMeetingsTree, flattenTree, buildTags, TAG_IDS,
} from '../lib/tags.js';
import { check, done } from './_check.mjs';

const noPeople = new Map();

// --- reading the view out of the URL ---------------------------------------
const fresh = readView({});
check('with an empty address the first slot sorts by date, newest first',
    [fresh.slots[0].tag, fresh.slots[0].direction], ['date', 'desc']);
check('the other three slots start empty',
    fresh.slots.slice(1).map((s) => s.tag), ['', '', '']);
check('nothing is grouped by default', fresh.groups, []);

check('an unknown sort column is ignored, the default takes over',
    readView({ tag: 'DROP TABLE' }).slots[0].tag, 'date');
check('an unknown column in a later slot leaves it empty',
    readView({ tag2: 'nonsense' }).slots[1].tag, '');
check('a known column is taken as is',
    readView({ tag: 'importance', dir: 'asc' }).slots[0].tag, 'importance');
check('any direction other than asc means desc',
    readView({ dir: 'sideways' }).slots[0].direction, 'desc');

check('filter values arrive tilde-separated',
    readView({ fval: 'a~b~c' }).slots[0].filterValues, ['a', 'b', 'c']);
check('empty pieces between tildes are dropped',
    readView({ fval: 'a~~b~' }).slots[0].filterValues, ['a', 'b']);
check('no filter is an empty list, never undefined',
    readView({}).slots[0].filterValues, []);
check('exclude is honoured, anything else is keep',
    [readView({ fmode: 'exclude' }).slots[0].filterMode, readView({ fmode: 'x' }).slots[0].filterMode],
    ['exclude', 'keep']);

check('grouping levels come in order',
    readView({ group: 'type', group2: 'people' }).groups, ['type', 'people']);
check('the same column cannot be a grouping level twice',
    readView({ group: 'type', group2: 'type', group3: 'importance' }).groups, ['type', 'importance']);
check('an unknown grouping level is dropped',
    readView({ group: 'nope', group2: 'type' }).groups, ['type']);
check('group keeps the first level for older links',
    readView({ group: 'type', group2: 'people' }).group, 'type');

// --- sorting ---------------------------------------------------------------
const meetings = [
    { id: 'a', date: '2026-08-01T10:00:00Z', importance: 1, types: ['automation'] },
    { id: 'b', date: '2026-08-03T10:00:00Z', importance: 5, types: ['client_meeting'] },
    { id: 'c', date: '2026-08-02T10:00:00Z', importance: 5, types: ['automation', 'onboarding'] },
];
const order = (list) => list.map((m) => m.id);
const slot = (tag, over = {}) => ({ tag, direction: 'desc', filterMode: 'keep', filterValues: [], ...over });

check('newest first by default',
    order(applySlots(meetings, noPeople, [slot('date')])), ['b', 'c', 'a']);
check('the other direction reverses it',
    order(applySlots(meetings, noPeople, [slot('date', { direction: 'asc' })])), ['a', 'c', 'b']);
check('the second level only decides a tie in the first',
    order(applySlots(meetings, noPeople, [slot('importance'), slot('date', { direction: 'asc' })])),
    ['c', 'b', 'a']);
check('a slot with no column takes no part',
    order(applySlots(meetings, noPeople, [slot('')])), ['a', 'b', 'c']);
check('sorting does not disturb the list it was given',
    (() => { const copy = [...meetings]; applySlots(copy, noPeople, [slot('date')]); return order(copy); })(),
    ['a', 'b', 'c']);

// --- filtering -------------------------------------------------------------
//the slot sorts by type as well as filters by it, and both rows share the
//same type, so a tie leaves them in the order they came
check('keep leaves only the matching rows',
    order(applySlots(meetings, noPeople, [slot('type', { filterValues: ['Automation'] })], 'en')),
    ['a', 'c']);
check('exclude removes them instead',
    order(applySlots(meetings, noPeople, [slot('type', { filterMode: 'exclude', filterValues: ['Automation'] })], 'en')),
    ['b']);
check('a meeting with two types matches either of them',
    order(applySlots(meetings, noPeople, [slot('type', { filterValues: ['Onboarding'] })], 'en')), ['c']);

check('column filters are AND across columns',
    order(applyColumnFilters(meetings, noPeople, { type: ['Automation'], importance: ['★★★★★'] }, 'en')),
    ['c']);
check('and OR within one column',
    order(applyColumnFilters(meetings, noPeople, { type: ['Automation', 'Client meeting'] }, 'en')),
    ['a', 'b', 'c']);
check('an empty selection filters nothing out',
    order(applyColumnFilters(meetings, noPeople, { type: [] })), ['a', 'b', 'c']);
check('a filter on an unknown column is ignored, not treated as no matches',
    order(applyColumnFilters(meetings, noPeople, { nonsense: ['x'] })), ['a', 'b', 'c']);

// --- the grouping tree -----------------------------------------------------
const tree = groupMeetingsTree(meetings, noPeople, ['type'], 'en');
check('a meeting with two types appears under each of them — that is the point',
    tree.map((node) => [node.label, order(node.items ?? [])]).sort(),
    [['Automation', ['a', 'c']], ['Client meeting', ['b']], ['Onboarding', ['c']]].sort());

const flat = flattenTree(groupMeetingsTree(meetings, noPeople, ['importance', 'type'], 'en'));
check('flattening keeps one entry per row per branch, with its path',
    flat.every((entry) => entry.meeting && Array.isArray(entry.path) && entry.path.length === 2), true);

check('every flattened entry has a key of its own — the same meeting can sit in two branches',
    flat.length === new Set(flat.map((entry) => entry.key)).size, true);
check('a level no row has a value for is skipped, not shown as one empty bucket',
    groupMeetingsTree(meetings, noPeople, ['topics'], 'en'), null);

check('when some rows have a value and some do not, the bare ones get their own named bucket',
    groupMeetingsTree([{ id: 'x' }, { id: 'y', types: ['automation'] }], noPeople, ['type'], 'en')
        .map((n) => n.label).sort(),
    ['Automation', 'No type']);

check('every column the picker offers can be a grouping level',
    TAG_IDS.every((id) => id in buildTags('en')), true);

done();
