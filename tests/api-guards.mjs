// The two guards the API routes lean on: reading a body without trusting it,
// and counting how often one caller knocks.
//
// Run: node tests/api-guards.mjs   (no database, no env needed)
import { readJson, isUuid, text, int, oneOf, listOf, MAX_BODY_BYTES } from '../lib/http.js';
import { hit, callerKey, _reset } from '../lib/rate-limit.js';

let failed = 0;
const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const post = (body, headers = {}) =>
    new Request('http://test/api', { method: 'POST', body, headers });

// --- reading a body --------------------------------------------------------
check('a normal body comes back parsed',
    await readJson(post('{"title":"hi"}')), { title: 'hi' });

check('an empty body is an empty object, not an error',
    await readJson(post('')), {});

const broken = await readJson(post('{oops'));
check('malformed JSON is a 400, not a crash',
    [broken instanceof Response, broken.status], [true, 400]);

const notObject = await readJson(post('[1,2,3]'));
check('a JSON array is refused — routes read fields off an object',
    [notObject instanceof Response, notObject.status], [true, 400]);

const huge = await readJson(post('x'.repeat(MAX_BODY_BYTES + 1)));
check('an oversized body is refused before parsing',
    [huge instanceof Response, huge.status], [true, 413]);

const lying = await readJson(post('{"a":1}', { 'content-length': String(MAX_BODY_BYTES * 10) }));
check('a content-length over the cap is refused too',
    [lying instanceof Response, lying.status], [true, 413]);

// --- field readers ---------------------------------------------------------
check('text trims and cuts to length', text('  hello world  ', { max: 5 }), 'hello');
check('text of a non-string is the fallback', text(42, { fallback: '' }), '');
check('int clamps into range', [int(9, { min: 0, max: 5 }), int(-3, { min: 0, max: 5 })], [5, 0]);
check('int of nonsense is the fallback', int('abc', { fallback: 0 }), 0);
check('oneOf keeps only what is allowed',
    [oneOf('ai', ['ai', 'custom']), oneOf('evil', ['ai', 'custom'])], ['ai', null]);
check('listOf drops unknowns and duplicates',
    listOf(['a', 'x', 'a', 'b'], ['a', 'b']), ['a', 'b']);
check('listOf of a non-array is empty', listOf('a,b', ['a', 'b']), []);

check('a real uuid passes', isUuid('3040616b-9268-4fd5-8fe1-7cb4549ebf4f'), true);
check('a malformed id is caught before Postgres sees it', isUuid('../../etc/passwd'), false);

// --- counting knocks -------------------------------------------------------
_reset();
const limit = { max: 3, windowMs: 1000 };
const first = [hit('k', limit, 0).ok, hit('k', limit, 0).ok, hit('k', limit, 0).ok];
check('the first three pass', first, [true, true, true]);

const over = hit('k', limit, 0);
check('the fourth is refused with a wait', [over.ok, over.retryAfter], [false, 1]);

check('a different caller is unaffected', hit('other', limit, 0).ok, true);
check('the window reopens once it runs out', hit('k', limit, 1001).ok, true);

const ip = new Request('http://test/api', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } });
check('the caller is the signed-in person when known',
    callerKey(ip, 'a@b.c'), 'user:a@b.c');
check('otherwise the address it came from, client first',
    callerKey(ip, null), 'ip:9.9.9.9');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
