// ADVERSARIAL: attacking the search-query builder (lib/search-query.js) and
// the date-range parser (lib/date-range.js).
//
// The search box feeds Postgres tsquery, whose own operators (& | ! : * ( ))
// are a syntax error if passed through. The date fields come from the URL and
// can be hand-edited to anything. We try to inject, to reverse, and to smuggle
// a structurally-valid-but-nonsense date.
//
// Run: node tests/adversarial-search-and-dates.mjs   (no database, no env)
import { toTsQuery, isMissingSearchColumn } from '../lib/search-query.js';
import { readRange, dayOf, inRange, filterByRange, presetRange, rangeShape } from '../lib/date-range.js';
import { check, done } from './_check.mjs';

// --- tsquery injection ------------------------------------------------------
// The builder extracts only [\p{L}\p{N}_] runs and rebuilds the query, so raw
// operators become word separators, not syntax. Injection is neutralised.
check('GUARD HOLDS: tsquery operators from the box become plain words',
    toTsQuery('foo & bar | baz:* ! (x)'), 'foo:* & bar:* & baz:* & x:*');
check('GUARD HOLDS: a string of only operators yields an empty query (matches nothing safely)',
    toTsQuery('!@#$%^&*()'), '');
check('GUARD HOLDS: a lone backslash / quote cannot escape into the query',
    toTsQuery('"; DROP TABLE meetings; --'), 'drop:* & table:* & meetings:*');
check('GUARD HOLDS: null / undefined raw is an empty query, not a throw',
    [toTsQuery(null), toTsQuery(undefined)], ['', '']);
// A very long single token is kept whole — no crash, just one big prefix term.
check('GUARD HOLDS: a 10k-char token does not crash the builder',
    toTsQuery('a'.repeat(10000)).endsWith(':*'), true);

check('GUARD HOLDS: the missing-column signal is recognised by code and text',
    [isMissingSearchColumn('42703'), isMissingSearchColumn('column search_doc does not exist'),
        isMissingSearchColumn('unrelated')], [true, true, false]);

// --- date-range: garbage in the URL ----------------------------------------
// Nonsense is treated as "not selected" — the range simply opens on that side.
check('GUARD HOLDS: free-text dates are dropped to null',
    readRange({ from: 'yesterday', to: 'lol' }), { from: null, to: null });
check('GUARD HOLDS: reversed ends are swapped back, not shown as empty',
    readRange({ from: '2026-08-20', to: '2026-08-10' }), { from: '2026-08-10', to: '2026-08-20' });

// FOUND WEAKNESS: the ISO regex checks SHAPE, not validity. Month 13 / day 99
// is structurally \d{4}-\d{2}-\d{2}, so it is accepted as a real bound. Because
// the filter compares day-strings lexically, '2026-13-99' sorts after every
// real day and silently widens (or, as a `from`, empties) the result set.
check('FOUND WEAKNESS: an impossible but well-shaped date is accepted as a bound',
    readRange({ from: '2026-08-01', to: '2026-13-99' }), { from: '2026-08-01', to: '2026-13-99' });
check('FOUND WEAKNESS: that nonsense `to` still passes the lexical filter',
    inRange('2026-09-15T10:00:00Z', { from: '2026-08-01', to: '2026-13-99' }), true);

// --- dayOf: extreme / bad instants -----------------------------------------
check('GUARD HOLDS: garbage instant is null, not a throw', dayOf('Infinity'), null);
check('GUARD HOLDS: an empty instant is null', dayOf(''), null);
check('GUARD HOLDS: a NaN date object string is null', dayOf('not-a-date'), null);
// The maximum representable JS date still formats; one past it is Invalid -> null.
check('GUARD HOLDS: beyond the max JS date, dayOf is null (no throw)',
    dayOf('275760-09-14T00:00:00Z'), null);

// --- inRange / filter: a meeting with no date never sneaks in --------------
check('GUARD HOLDS: a dateless meeting is excluded from any bounded range',
    inRange(null, { from: '2026-01-01' }), false);
check('GUARD HOLDS: filterByRange keeps everything when no bounds given',
    filterByRange([{ date: null }, { date: 'x' }], {}).length, 2);
check('GUARD HOLDS: a garbage date row is filtered out under real bounds',
    filterByRange([{ date: 'garbage' }, { date: '2026-08-15T09:00:00Z' }],
        { from: '2026-08-01', to: '2026-08-31' }).length, 1);

// --- presetRange with a bad "now" ------------------------------------------
// A bad now falls back to the real today, so the presets never return junk.
const wk = presetRange('week', 'not-a-date');
check('GUARD HOLDS: preset with a bad now still yields a shaped ISO range',
    /^\d{4}-\d{2}-\d{2}$/.test(wk.from) && /^\d{4}-\d{2}-\d{2}$/.test(wk.to), true);
check('GUARD HOLDS: an unknown preset name is the open range',
    presetRange('__proto__', '2026-08-24T00:00:00Z'), { from: null, to: null });

check('GUARD HOLDS: rangeShape of an open range is "any"', rangeShape({}), { kind: 'any' });

done();
