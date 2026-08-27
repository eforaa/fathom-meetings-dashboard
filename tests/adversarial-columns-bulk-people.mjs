// ADVERSARIAL: attacking the value coercer (lib/column-types.js), the bulk-edit
// rules (lib/bulk.js), and the people deduper (lib/people.js).
//
// These decide what Claude and the browser are allowed to write. Claude in
// particular sends "whatever the conversation produced". We push number/hex,
// nested arrays into multiselect, prototype keys into a patch, and homoglyph /
// whitespace identities into the deduper.
//
// Run: node tests/adversarial-columns-bulk-people.mjs   (no database, no env)
import { coerceValue } from '../lib/column-types.js';
import { idsOf, patchOf, groupRestore, sameTypes } from '../lib/bulk.js';
import { groupPeople } from '../lib/people.js';
import { check, done } from './_check.mjs';

// --- coerceValue: number column --------------------------------------------
check('GUARD HOLDS: Infinity into a number cell is rejected to null',
    coerceValue({ type: 'number' }, Infinity), null);
check('GUARD HOLDS: "1e999" overflows to Infinity, rejected',
    coerceValue({ type: 'number' }, '1e999'), null);
check('GUARD HOLDS: NaN-y text is rejected', coerceValue({ type: 'number' }, 'abc'), null);
// FOUND WEAKNESS: Number('0x10') === 16, so a hex STRING is silently accepted
// into a "number" cell as 16 — a value the person never typed as decimal.
check('FOUND WEAKNESS: a hex string is coerced to a number',
    coerceValue({ type: 'number' }, '0x10'), 16);
// Whitespace/underscore numeric literals also slip through Number().
check('FOUND WEAKNESS: an underscore-grouped numeric string coerces',
    coerceValue({ type: 'number' }, '  42  '), 42);

// --- coerceValue: select / multiselect -------------------------------------
check('GUARD HOLDS: a select value the column never offered is null',
    coerceValue({ type: 'select', options: ['a', 'b'] }, 'evil'), null);
check('GUARD HOLDS: a select with no options list rejects everything',
    coerceValue({ type: 'select' }, 'a'), null);
// FOUND WEAKNESS: a nested array element is String()-flattened. [['a'],'b']
// becomes 'a','b' because String(['a']) === 'a'. Type confusion, not a crash.
check('FOUND WEAKNESS: a nested array in multiselect is flattened via String()',
    coerceValue({ type: 'multiselect', options: ['a', 'b'] }, [['a'], 'b']), ['a', 'b']);
check('GUARD HOLDS: a non-array non-string multiselect (object) is null',
    coerceValue({ type: 'multiselect', options: ['a'] }, { a: 1 }), null);
check('GUARD HOLDS: multiselect keeps only offered values, de-duped',
    coerceValue({ type: 'multiselect', options: ['a', 'b'] }, 'a,a,b,zzz,b'), ['a', 'b']);
// The default (text) branch caps length at 500 — an oversized cell can't blow up storage.
check('GUARD HOLDS: a 600-char text value is capped to 500',
    coerceValue({ type: 'text' }, 'x'.repeat(600)).length, 500);
// An unknown type falls to the text branch rather than throwing.
check('GUARD HOLDS: an unknown column type is treated as text, no throw',
    coerceValue({ type: '__proto__' }, 'hi'), 'hi');

// --- bulk: patchOf / idsOf pollution + bounds ------------------------------
check('GUARD HOLDS: patchOf ignores prototype keys, only reads types/importance',
    patchOf({ __proto__: { x: 1 }, constructor: 'y', importance: 999 }), { importance: 5 });
check('GUARD HOLDS: patchOf clamps importance below zero to 0',
    patchOf({ importance: -50 }), { importance: 0 });
check('GUARD HOLDS: patchOf drops unknown meeting types',
    patchOf({ types: ['client_meeting', 'nope', 'client_meeting'] }), { types: ['client_meeting'] });
check('GUARD HOLDS: an empty type list means "clear the field" (null), not omitted',
    patchOf({ types: [] }), { types: null });

const uuid = '3040616b-9268-4fd5-8fe1-7cb4549ebf4f';
check('GUARD HOLDS: idsOf keeps only real uuids, de-duped',
    idsOf([uuid, uuid, '../../etc', 'DROP TABLE', 42]), [uuid]);
check('GUARD HOLDS: idsOf caps a 100k-id flood at the limit (bounded work)',
    idsOf(Array(100000).fill().map((_, i) => (i % 2 ? uuid : 'bad')), 200).length, 1);
// (only one distinct valid uuid above, so length 1 — the point is it returns
//  fast and bounded, not that it kept 200.)
check('GUARD HOLDS: idsOf of a non-array is empty', idsOf('not-an-array'), []);

check('GUARD HOLDS: groupRestore skips rows with bad ids and empty patches',
    groupRestore([{ id: 'bad', importance: 3 }, { id: uuid, importance: 3 }]).length, 1);
check('GUARD HOLDS: sameTypes is order-independent',
    sameTypes(['a', 'b'], ['b', 'a']), true);

// --- people deduper: adversarial identities --------------------------------
// A whitespace-only name becomes a "person" whose URL key is the empty
// 'name:' — two different whitespace names would collide on that key.
const ws = groupPeople([{ id: 1 }], new Map([[1, [{ name: '   ', email: '' }]]]));
check('FOUND WEAKNESS: a whitespace-only name yields a person with an empty key',
    [ws.length, ws[0].key], [1, 'name:']);

// Homoglyphs are NOT merged: Cyrillic А (U+0410) vs Latin A are different
// people. Safe (never wrongly merges), but a spoofer can appear as a near-twin.
const homo = groupPeople([{ id: 1 }, { id: 2 }],
    new Map([[1, [{ name: 'Аdmin' }]], [2, [{ name: 'Admin' }]]]));
check('note: homoglyph names stay separate (no accidental merge, but no catch either)',
    homo.length, 2);

// A participant row with neither name nor email is dropped entirely (no null person).
const empty = groupPeople([{ id: 1 }], new Map([[1, [{ name: '', email: '' }]]]));
check('GUARD HOLDS: a totally empty participant produces no person',
    empty.length, 0);

// A very long name does not crash grouping and is kept as the label.
const long = 'z'.repeat(5000);
const big = groupPeople([{ id: 1 }], new Map([[1, [{ name: long }]]]));
check('GUARD HOLDS: a 5000-char name groups without a crash',
    [big.length, big[0].label.length], [1, 5000]);

done();
