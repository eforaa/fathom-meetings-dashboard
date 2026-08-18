'use client';

import { createContext, useCallback, useContext } from 'react';
import { DEFAULT_LANG, t as translate } from '@/lib/i18n';

//The language is decided once, on the server, from the cookie. Client
//components read it from here instead of touching document.cookie themselves —
//otherwise the first render would not match what the server sent.
const LangContext = createContext(DEFAULT_LANG);

export function LangProvider({ lang, children }) {
    return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

//the current language
export function useLang() {
    return useContext(LangContext);
}

//a bound translator, so components read `T('nav.people')` rather than
//repeating the language on every call
export function useT() {
    const lang = useContext(LangContext);
    //stable while the language holds: components memoise on T, and a fresh
    //function every render would defeat that
    return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
