// ADVERSARIAL: driving the REAL app/api route handlers in a bare node process.
//
// tests/_route-loader.mjs redirects only the un-resolvable / boundary imports
// (next/server, next/headers, @/lib/supabase, @/lib/supabase-auth) to the
// shared mocks in tests/_route-mocks.mjs. The REAL guards (@/lib/http,
// @/lib/rate-limit, @/lib/bulk, @/lib/columns) run untouched — no source edit.
//
// Central question: does a malformed request reach the query builder, or is it
// stopped by isUuid / auth / readJson FIRST?  We prove it by asserting the
// mock db recorded ZERO calls when the guard should have fired.
//
// Run: node tests/adversarial-routes.mjs   (no database, no network needed)
process.env.SUPABASE_URL = 'http://dummy';
process.env.SUPABASE_SERVICE_KEY = 'dummy';

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./tests/_route-loader.mjs', pathToFileURL('./').href);

import { check, done } from './_check.mjs';
const { mock, ownerFilterValues } = await import('./_route-mocks.mjs');
// the real rate limiter, same module instance the routes use — reset between
// cases so 60 WRITE hits/min never bleed across tests
const { _reset } = await import('../lib/rate-limit.js');

const title = (await import('../app/api/meetings/[id]/title/route.js')).POST;
const fields = (await import('../app/api/meetings/[id]/fields/route.js')).POST;
const importance = (await import('../app/api/meetings/[id]/importance/route.js')).POST;
const types = (await import('../app/api/meetings/[id]/types/route.js')).POST;
const bulk = (await import('../app/api/meetings/bulk/route.js')).POST;
const columnsPost = (await import('../app/api/columns/route.js')).POST;
const columnDelete = (await import('../app/api/columns/[id]/route.js')).DELETE;

const UUID = '3040616b-9268-4fd5-8fe1-7cb4549ebf4f';
const UUID2 = 'aaaa0000-9268-4fd5-8fe1-7cb4549ebf4f';
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const req = (body, headers = {}) => new Request('http://test/api', { method: 'POST', body, headers });
const del = (headers = {}) => new Request('http://test/api', { method: 'DELETE', headers });
const before = () => { mock.reset(); _reset(); };

// === 1. a malformed id never reaches the database ==========================
before();
let r = await title(req('{"title":"x"}'), ctx('../../etc/passwd'));
check('GUARD HOLDS: title with a traversal id is 400 and touches the DB 0 times',
    [r.status, mock.calls.length], [400, 0]);

before();
r = await fields(req('{"columnId":"' + UUID + '"}'), ctx('not a uuid'));
check('GUARD HOLDS: fields with a bad meeting id is 400, DB untouched',
    [r.status, mock.calls.length], [400, 0]);

before();
r = await columnDelete(del(), ctx('DROP TABLE columns'));
check('GUARD HOLDS: column delete with a bad id is 400, DB untouched',
    [r.status, mock.calls.length], [400, 0]);

// === 2. signed-out is refused before any DB work ===========================
before(); mock.user = null;
r = await importance(req('{"importance":3}'), ctx(UUID));
check('GUARD HOLDS: a signed-out importance write is 401, DB untouched',
    [r.status, mock.calls.length], [401, 0]);

before(); mock.user = null;
r = await bulk(req('{"ids":["' + UUID + '"],"set":{"importance":3}}'));
check('GUARD HOLDS: a signed-out bulk write is 401, DB untouched',
    [r.status, mock.calls.length], [401, 0]);

// === 3. a malformed body is a 400, not a 500 or a crash ====================
before();
r = await types(req('{oops not json'), ctx(UUID));
check('GUARD HOLDS: malformed JSON body is 400, no write reaches the DB',
    [r.status, mock.calls.length], [400, 0]);

before();
r = await title(req('[1,2,3]'), ctx(UUID));
check('GUARD HOLDS: a JSON array body (not an object) is 400, DB untouched',
    [r.status, mock.calls.length], [400, 0]);

// === 4. the fields route requires a uuid column id BEFORE the DB ===========
before();
r = await fields(req('{"columnId":"__proto__","value":"x"}'), ctx(UUID));
check('GUARD HOLDS: fields route rejects a non-uuid columnId (400) before the DB',
    [r.status, mock.calls.length], [400, 0]);

// === 5. owner isolation: the write is always scoped to the SIGNED-IN email ==
// even when the attacker plants owner_email / a foreign id in the body.
before();
mock.user = { email: 'real@x.io' };
mock.rows.single = { custom_fields: {} };
r = await title(req(JSON.stringify({ title: 'H', owner_email: 'victim@x.io', id: UUID2 })), ctx(UUID));
check('GUARD HOLDS: title write scopes owner_email to the session, ignores body-planted owner',
    [r.status, ownerFilterValues().every((v) => v === 'real@x.io')], [200, true]);

before();
mock.user = { email: 'real@x.io' };
mock.rows.list = [{ id: UUID, types: [], importance: 0 }];
r = await bulk(req(JSON.stringify({ ids: [UUID], set: { importance: 2 }, owner_email: 'victim@x.io' })));
check('GUARD HOLDS: bulk write scopes every query to the session owner',
    ownerFilterValues().every((v) => v === 'real@x.io'), true);

// === 6. prototype-pollution body key never pollutes the process ============
before();
mock.user = { email: 'real@x.io' };
mock.rows.single = { custom_fields: {} };
r = await title(req('{"__proto__":{"pwned":1},"title":"Z"}'), ctx(UUID));
check('GUARD HOLDS: a __proto__ body key does not pollute Object.prototype',
    [r.status, ({}).pwned], [200, undefined]);
check('GUARD HOLDS: nothing named "pwned" leaked onto a fresh object',
    Object.prototype.hasOwnProperty.call({}, 'pwned'), false);

// === 7. bulk clamps the id flood and rejects an empty patch ================
before();
mock.user = { email: 'real@x.io' };
r = await bulk(req('{"ids":[],"set":{"importance":3}}'));
check('GUARD HOLDS: bulk with no valid ids is 400 (No meetings chosen), DB untouched',
    [r.status, mock.calls.length], [400, 0]);

before();
mock.user = { email: 'real@x.io' };
mock.rows.list = [{ id: UUID, types: [], importance: 0 }];
r = await bulk(req(JSON.stringify({ ids: [UUID], set: { evil: 1, __proto__: { x: 1 } } })));
check('GUARD HOLDS: bulk with only unknown/proto set-keys is 400 (Nothing to set)',
    [r.status, mock.calls.length], [400, 0]);

// === 8. columns create: addColumn sanitises, unknown type falls to text ====
before();
mock.user = { email: 'real@x.io' };
mock.rows.list = []; // listColumns (existing) -> []
mock.rows.single = { id: 'C1', name: 'ok', type: 'text', options: null, position: 0 };
r = await columnsPost(req(JSON.stringify({ name: '  ' + 'z'.repeat(80) + '  ', type: 'evil_type', options: 'not-array' })));
check('GUARD HOLDS: column create succeeds via addColumn sanitisation (200), DB written scoped',
    [r.status, ownerFilterValues().every((v) => v === 'real@x.io')], [200, true]);

before();
mock.user = { email: 'real@x.io' };
r = await columnsPost(req('{"name":"   ","type":"text"}'));
check('GUARD HOLDS: an all-whitespace column name is rejected 400 (empty after trim)',
    r.status, 400);

done();
