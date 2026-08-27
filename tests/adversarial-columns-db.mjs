// ADVERSARIAL: lib/columns.js setColumnValue — the write that only needed a
// database. We monkeypatch the exported db (test-process-local, not a source
// edit) with a DISCRIMINATING fake: it answers custom_columns / meetings
// lookups based on the eq('id', ...) / eq('owner_email', ...) filters the code
// actually applies. This lets us prove owner scoping and chase the coordinator's
// question: can columnId === '__proto__' reach the custom_fields object and
// pollute anything?
//
// Run: node tests/adversarial-columns-db.mjs   (no database, no network needed)
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';

import { check, done } from './_check.mjs';
const { db } = await import('../lib/supabase.js');

// --- discriminating fake ----------------------------------------------------
// tables: known columns and meetings, each keyed by (id, owner_email).
let COLUMNS = {}; // id -> { owner, row }
let MEETINGS = {}; // id -> { owner, custom_fields }
let lastUpdate = null; // the custom_fields object the code tried to write

db.from = (table) => {
    const filters = {};
    let op = null;
    let updatePayload = null;
    const api = {
        select() { return api; },
        update(payload) { op = 'update'; updatePayload = payload; return api; },
        eq(col, val) { filters[col] = val; return api; },
        maybeSingle() {
            if (table === 'custom_columns') {
                const hit = COLUMNS[filters.id];
                const data = hit && hit.owner === filters.owner_email ? hit.row : null;
                return Promise.resolve({ data, error: null });
            }
            if (table === 'meetings') {
                const hit = MEETINGS[filters.id];
                const data = hit && hit.owner === filters.owner_email
                    ? { custom_fields: hit.custom_fields } : null;
                return Promise.resolve({ data, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        },
        then(ok, err) {
            // terminal for the update().eq().eq() chain
            if (op === 'update') {
                lastUpdate = updatePayload;
                const hit = MEETINGS[filters.id];
                if (hit && hit.owner === filters.owner_email) hit.custom_fields = updatePayload.custom_fields;
            }
            return Promise.resolve({ data: null, error: null }).then(ok, err);
        },
    };
    return api;
};

const { setColumnValue } = await import('../lib/columns.js');

const seed = () => {
    COLUMNS = {
        'col-text': { owner: 'a@x.io', row: { id: 'col-text', type: 'text', options: null } },
        'col-select': { owner: 'a@x.io', row: { id: 'col-select', type: 'select', options: ['red', 'blue'] } },
        // a deliberately planted column literally named __proto__ (to test the
        // worst case where the id check itself is passed)
        '__proto__col': { owner: 'a@x.io', row: { id: '__proto__col', type: 'text', options: null } },
    };
    MEETINGS = { 'M1': { owner: 'a@x.io', custom_fields: {} } };
    lastUpdate = null;
};

const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// === owner isolation ========================================================
seed();
check('GUARD HOLDS: a column owned by A is not writable by B (Column not found)',
    await threw(() => setColumnValue('b@x.io', 'M1', 'col-text', 'hi')), 'Column not found');

seed();
check('GUARD HOLDS: a meeting owned by A is not writable by B (Meeting not found)',
    // column belongs to b? no — make a b-owned column so we get past the column
    // check, then the meeting check must fail for the cross-owner meeting
    await threw(async () => {
        COLUMNS['col-b'] = { owner: 'b@x.io', row: { id: 'col-b', type: 'text', options: null } };
        return setColumnValue('b@x.io', 'M1', 'col-b', 'hi');
    }), 'Meeting not found');

// === a non-existent / injection columnId is rejected by the DB lookup ======
seed();
check('GUARD HOLDS: an unknown columnId throws Column not found (never reaches the write)',
    await threw(() => setColumnValue('a@x.io', 'M1', 'nope-not-a-column', 'x')), 'Column not found');
seed();
check('GUARD HOLDS: columnId "__proto__" is just an unknown id -> Column not found',
    await threw(() => setColumnValue('a@x.io', 'M1', '__proto__', 'x')), 'Column not found');

// === the WORST case: a column literally named __proto__ actually exists =====
// Even then, `fields['__proto__'] = 'x'` is a no-op assignment (a string is not
// a valid prototype), so no own key is created and nothing is polluted.
seed();
const res = await setColumnValue('a@x.io', 'M1', '__proto__col', 'danger');
check('note: a column id __proto__col is a normal id and stores normally',
    res, { columnId: '__proto__col', value: 'danger' });
check('GUARD HOLDS: writing under a __proto__col id does not pollute Object.prototype',
    ({}).danger, undefined);
check('GUARD HOLDS: the written custom_fields has __proto__col as a plain own key',
    Object.prototype.hasOwnProperty.call(lastUpdate.custom_fields, '__proto__col')
        && lastUpdate.custom_fields['__proto__col'] === 'danger', true);

// === coerce path: an invalid select value is REJECTED, not stored, and does
//     not wipe an existing good value ("value not allowed") ==================
seed();
MEETINGS.M1.custom_fields = { 'col-select': 'red' };
check('GUARD HOLDS: an off-list select value is refused (does not overwrite the good value)',
    await threw(() => setColumnValue('a@x.io', 'M1', 'col-select', 'chartreuse')),
    'Value not allowed for this column');
check('GUARD HOLDS: the previously good select value is still intact after the refusal',
    MEETINGS.M1.custom_fields['col-select'], 'red');

// an explicit empty clears the cell (delete), which is allowed
seed();
MEETINGS.M1.custom_fields = { 'col-text': 'was-here' };
await setColumnValue('a@x.io', 'M1', 'col-text', '');
check('GUARD HOLDS: an empty value clears (deletes) the cell rather than storing ""',
    Object.prototype.hasOwnProperty.call(lastUpdate.custom_fields, 'col-text'), false);

// a valid select value is stored
seed();
const okSel = await setColumnValue('a@x.io', 'M1', 'col-select', 'blue');
check('GUARD HOLDS: a valid select value is stored', okSel.value, 'blue');

// an oversized text value is capped at 500 by coerceValue
seed();
const big = await setColumnValue('a@x.io', 'M1', 'col-text', 'y'.repeat(9000));
check('GUARD HOLDS: an oversized text cell is capped at 500 chars',
    String(big.value).length, 500);

done();
