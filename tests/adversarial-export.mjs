// ADVERSARIAL: attacking the export writers (lib/export.js).
//
// The existing export test proves the RFC-4180 quoting is correct. This file
// attacks a threat that quoting was never meant to stop: CSV/formula injection.
// When a cell begins with = + - @ (or a tab/CR before one), Excel and Google
// Sheets treat the whole cell as a FORMULA the moment the victim opens the
// downloaded file — =cmd|'/c calc'!A0, =IMPORTXML(...) exfiltrating data, etc.
// A meeting title, a person's name, or a Claude-written summary flows straight
// into these cells, so any of them can carry the payload.
//
// Run: node tests/adversarial-export.mjs   (no database, no env needed)
import { csvCell, toCsv, mdCell } from '../lib/export.js';
import { check, done } from './_check.mjs';

// --- BREAK FOUND: formula injection is not neutralised ----------------------
// csvCell only quotes when it sees [",\r\n;]. A payload with none of those —
// a leading =, +, -, or @ — passes through completely raw.
check('FOUND BREAK: =formula passes through raw (CSV/formula injection)',
    csvCell('=1+1'), '=1+1');
check('FOUND BREAK: +formula passes through raw',
    csvCell('+1+1'), '+1+1');
check('FOUND BREAK: -formula passes through raw',
    csvCell('-1+1'), '-1+1');
check('FOUND BREAK: @formula passes through raw',
    csvCell('@SUM(A1)'), '@SUM(A1)');

// The dangerous DDE payload the security world uses as the canonical example.
// No comma/quote/newline in it, so it is emitted verbatim.
check('FOUND BREAK: a DDE command payload is emitted verbatim',
    csvCell('=cmd|\'/c calc\'!A0'), '=cmd|\'/c calc\'!A0');

// Quoting does NOT save it either: Excel unquotes "=SUM(A1,A2)" back to a
// formula and still evaluates it. The comma only triggers quoting, not defusing.
check('a payload WITH a comma is merely quoted, still a live formula on open',
    csvCell('=SUM(A1,A2)'), '"=SUM(A1,A2)"');

// --- BREAK FOUND: the payload survives into a real exported row -------------
const rows = [
    // no comma/quote/newline, so it is emitted RAW — a live formula in the file
    { title: '=IMPORTXML(1)', importance: 5 },
    { title: '@import', importance: 0 },
];
const columns = [
    { title: 'Meeting', value: (r) => r.title },
    { title: 'Importance', value: (r) => r.importance, numeric: true },
];
const csv = toCsv(rows, columns);
const firstData = csv.split('\r\n')[1];
check('FOUND BREAK: the first data cell of the file begins with = (a live formula)',
    firstData.startsWith('='), true);
check('FOUND BREAK: an @-payload row is written raw too',
    csv.split('\r\n')[2], '@import,0');

// --- what DOES hold: the classic RFC-4180 dangers are handled ---------------
// (documented so the break above is not mistaken for "escaping is broken" —
//  it isn't, it just addresses a different threat.)
check('GUARD HOLDS: a comma still forces quoting', csvCell('a,b'), '"a,b"');
check('GUARD HOLDS: an embedded quote is doubled', csvCell('a"b'), '"a""b"');
check('GUARD HOLDS: a newline is wrapped', csvCell('a\nb'), '"a\nb"');
check('GUARD HOLDS: a semicolon (ru-Excel separator) is wrapped', csvCell('a;b'), '"a;b"');

// A tab-led formula (Excel strips a leading tab, then sees =): also raw. Tab is
// not in the quoting set, so this slips through as well.
check('FOUND BREAK: a tab before the = is not treated as dangerous',
    csvCell('\t=1+1'), '\t=1+1');

// Markdown does not execute formulas, so mdCell not neutralising = is benign,
// but note it also passes = through — only pipes/backslashes/newlines matter there.
check('mdCell leaves = alone (harmless in Markdown, no formula engine)',
    mdCell('=1+1'), '=1+1');

done();
