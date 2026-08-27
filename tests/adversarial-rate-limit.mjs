// ADVERSARIAL: attacking the rate limiter (lib/rate-limit.js).
//
// The limiter keys on x-forwarded-for when no identity is known. That header
// is fully attacker-controlled before Vercel rewrites it, so we probe: can a
// caller pick their own bucket (evade the limit), or collapse every anonymous
// caller into ONE bucket (deny others)?  We also feed it degenerate clocks.
//
// Run: node tests/adversarial-rate-limit.mjs   (no database, no env needed)
import { hit, callerKey, _reset } from '../lib/rate-limit.js';
import { check, done } from './_check.mjs';

const req = (xff) => new Request('http://test/api', xff == null ? {} : { headers: { 'x-forwarded-for': xff } });

// --- caller key is whatever the header says --------------------------------
// The client's own value is taken as the client IP (first token). So a caller
// can rotate this token freely and land in a brand-new bucket every request —
// evading the per-key cap. This is acknowledged in the module comments as a
// known limitation; the test pins the *observable* consequence.
check('FOUND WEAKNESS: caller can choose its own bucket via x-forwarded-for',
    [callerKey(req('1.1.1.1'), null), callerKey(req('2.2.2.2'), null)],
    ['ip:1.1.1.1', 'ip:2.2.2.2']);

// A leading empty token (", real") collapses to 'unknown' — so every caller who
// sends such a header shares ONE bucket. Combined with a real caller who sends
// no header, they contend for the same 'ip:unknown' allowance (mild self-DoS).
check('FOUND WEAKNESS: an empty first XFF token collapses to a shared ip:unknown bucket',
    [callerKey(req('  , 9.9.9.9'), null), callerKey(req(null), null)],
    ['ip:unknown', 'ip:unknown']);

// A known identity always wins over the header, so a signed-in user cannot be
// impersonated into someone else's bucket via XFF. Held.
check('GUARD HOLDS: a known identity ignores the header entirely',
    callerKey(req('6.6.6.6'), 'user@x.io'), 'user:user@x.io');

// --- the counter itself: the honest path -----------------------------------
_reset();
const L = { max: 3, windowMs: 1000 };
const okThree = [hit('c', L, 0).ok, hit('c', L, 0).ok, hit('c', L, 0).ok];
const fourth = hit('c', L, 0);
check('GUARD HOLDS: three pass then the fourth is refused',
    [okThree, fourth.ok, fourth.retryAfter], [[true, true, true], false, 1]);
check('GUARD HOLDS: the window reopens after it elapses', hit('c', L, 1001).ok, true);

// --- degenerate clocks (server-side only; not caller-reachable, documented) -
// now is Date.now() and windowMs is a server constant, so these are robustness
// notes, not attacks. The limiter does not throw on any of them.
_reset();
check('note: NaN clock never throws (first hit still ok)',
    hit('n', { max: 1, windowMs: 1000 }, NaN).ok, true);
_reset();
// With a NaN window, resetAt is NaN and (NaN >= NaN) is false, so the window
// never reopens — the bucket sticks forever. retryAfter degrades to NaN once
// the cap is passed. Not reachable (windowMs is constant), but recorded.
const nan1 = hit('m', { max: 1, windowMs: NaN }, 0);
const nan2 = hit('m', { max: 1, windowMs: NaN }, 0);
check('note: a NaN window sticks the bucket and yields a NaN retryAfter',
    [nan1.ok, nan2.ok, Number.isNaN(nan2.retryAfter)], [true, false, true]);

done();
