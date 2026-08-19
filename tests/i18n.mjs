// Three languages, one interface.
//
// The failure this guards against is quiet: someone adds a phrase, translates
// two of the three, and the third shows a raw key like "row.more" — usually in
// the language nobody on the team reads, so nobody notices. lib/i18n warns
// about it in the console outside production, which helps only if someone is
// watching the console.
import { LANGS, DEFAULT_LANG, LANG_LABELS, LOCALES, normalizeLang, t, plural } from '../lib/i18n/index.js';
import { uk } from '../lib/i18n/uk.js';
import { ru } from '../lib/i18n/ru.js';
import { en } from '../lib/i18n/en.js';
import { check, done } from './_check.mjs';

const dicts = { uk, ru, en };

// --- the three dictionaries describe the same interface --------------------
const keys = Object.fromEntries(Object.entries(dicts).map(([lang, d]) => [lang, Object.keys(d)]));
const reference = new Set(keys.en);

for (const lang of LANGS) {
    check(`${lang}: nothing missing against english`,
        keys[lang].length && [...reference].filter((key) => !dicts[lang][key]), []);
    check(`${lang}: nothing extra english does not have`,
        keys[lang].filter((key) => !reference.has(key)), []);
}

check('every language carries the same number of phrases',
    new Set(LANGS.map((lang) => keys[lang].length)).size, 1);

check('no phrase is left empty',
    LANGS.flatMap((lang) => keys[lang].filter((key) => !String(dicts[lang][key]).trim())), []);

// --- placeholders must survive translation ---------------------------------
const holes = (phrase) => (String(phrase).match(/\{(\w+)\}/g) ?? []).sort();
check('a phrase keeps the same placeholders in all three languages — {n} lost in translation prints nothing',
    keys.en.filter((key) => LANGS.some((lang) => String(holes(dicts[lang][key])) !== String(holes(en[key])))),
    []);

// --- the machinery ---------------------------------------------------------
check('every language has a label for the switch and a locale',
    LANGS.every((lang) => LANG_LABELS[lang] && LOCALES[lang]), true);
check('ukrainian is the language a new visitor gets', DEFAULT_LANG, 'uk');
check('an unknown language falls back to the default', normalizeLang('de'), 'uk');
check('a known one is kept', normalizeLang('en'), 'en');

check('variables are filled in', t('en', 'duration.min', { n: 7 }), '7 min');
check('the same variable is filled everywhere it appears',
    t('en', 'home.count', { shown: 12, total: 222 }).includes('12')
    && t('en', 'home.count', { shown: 12, total: 222 }).includes('222'), true);
check('a missing key shows itself rather than an empty space',
    t('en', 'no.such.key.at.all'), 'no.such.key.at.all');

// --- plurals ---------------------------------------------------------------
const forms = { one: 'встреча', few: 'встречи', many: 'встреч' };
check('russian takes three forms',
    [1, 2, 5, 21, 22, 25, 11].map((n) => plural('ru', n, forms)),
    ['встреча', 'встречи', 'встреч', 'встреча', 'встречи', 'встреч', 'встреч']);
check('ukrainian takes three too',
    [1, 3, 8].map((n) => plural('uk', n, { one: 'зустріч', few: 'зустрічі', many: 'зустрічей' })),
    ['зустріч', 'зустрічі', 'зустрічей']);
check('english takes two',
    [1, 2].map((n) => plural('en', n, { one: 'meeting', other: 'meetings' })),
    ['meeting', 'meetings']);
check('a form the language does not need falls back instead of printing nothing',
    plural('en', 5, { many: 'meetings' }), 'meetings');

done();
