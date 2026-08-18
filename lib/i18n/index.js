import { uk } from './uk.js';
import { ru } from './ru.js';
import { en } from './en.js';

//every language the interface speaks, in the order the switcher offers them
export const LANGS = ['uk', 'ru', 'en'];

//what a first-time visitor sees. the browser's Accept-Language is deliberately
//ignored: different people would see different things, and that makes support
//conversations confusing
export const DEFAULT_LANG = 'uk';

//the cookie the choice lives in — same mechanism as the theme
export const LANG_COOKIE = 'lang';

//short names for the switcher
export const LANG_LABELS = { uk: 'УКР', ru: 'РУС', en: 'ENG' };

const DICTS = { uk, ru, en };

//locales for Intl. the time zone is NOT part of this: meetings are shown in
//Kyiv time whatever the language
export const LOCALES = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-GB' };

//anything unknown becomes the default, so a stale or hand-edited cookie can
//never leave the interface blank
export function normalizeLang(value) {
    return LANGS.includes(value) ? value : DEFAULT_LANG;
}

//writing the choice down, from the browser. kept out of the component body on
//purpose: an assignment to document.cookie in there is a side effect on
//something the component does not own, and the react compiler rules say so.
export function rememberLang(lang) {
    document.cookie = `${LANG_COOKIE}=${normalizeLang(lang)}; path=/; max-age=31536000; SameSite=Lax`;
}

//getLang() lives in ./server.js: it needs next/headers, and this module is
//imported by client components too — pulling next/headers in here would break
//the build for every one of them.

//one phrase. vars fill {placeholders}: t(lang, 'people.more', { n: 3 })
export function t(lang, key, vars) {
    const dict = DICTS[normalizeLang(lang)];
    let phrase = dict[key];

    if (phrase === undefined) {
        //a missing key shows itself instead of collapsing to an empty space,
        //so the gap is obvious on screen rather than invisible
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`i18n: no "${key}" for ${lang}`);
        }
        return key;
    }

    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            phrase = phrase.replaceAll(`{${name}}`, String(value));
        }
    }

    return phrase;
}

//ukrainian and russian need three plural forms, english two. Intl.PluralRules
//knows which form a number takes; the caller supplies the words.
//  plural(lang, 3, { one: 'зустріч', few: 'зустрічі', many: 'зустрічей' })
const pluralRules = new Map();

export function plural(lang, count, forms) {
    const locale = LOCALES[normalizeLang(lang)];

    if (!pluralRules.has(locale)) {
        pluralRules.set(locale, new Intl.PluralRules(locale));
    }

    const form = pluralRules.get(locale).select(count);
    //`other` is the form english always lands on, so it doubles as the fallback
    return forms[form] ?? forms.other ?? forms.many ?? '';
}

//the dictionaries have to describe the same interface. a key present in one and
//missing in another shows up on screen as a raw key, usually in the language
//nobody on the team reads — so it goes unnoticed. there is no test runner in
//this project, so the check runs here, once, and only outside production.
if (process.env.NODE_ENV !== 'production') {
    const keysOf = (dict) => new Set(Object.keys(dict));
    const reference = keysOf(en);

    for (const [name, dict] of Object.entries(DICTS)) {
        if (name === 'en') continue;

        const keys = keysOf(dict);
        const missing = [...reference].filter((key) => !keys.has(key));
        const extra = [...keys].filter((key) => !reference.has(key));

        if (missing.length) console.warn(`i18n: ${name} is missing ${missing.join(', ')}`);
        if (extra.length) console.warn(`i18n: ${name} has unknown ${extra.join(', ')}`);
    }
}
