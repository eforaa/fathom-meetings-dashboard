'use client';

import { useRouter } from 'next/navigation';
import { LANGS, LANG_LABELS, rememberLang } from '@/lib/i18n';
import { useLang, useT } from './lang-context';
import styles from './lang-switch.module.css';

//Three short buttons beside the theme toggle.
//The theme can change without a reload — it is just an attribute on <html>.
//The language cannot: every phrase was rendered on the server, so after the
//cookie is set the page has to be asked for again. router.refresh() re-renders
//the server components in place, keeping scroll position and the current view.
export default function LangSwitch() {
    const router = useRouter();
    const current = useLang();
    const T = useT();

    function choose(lang) {
        if (lang === current) return;

        rememberLang(lang);
        router.refresh();
    }

    return (
        <div className={styles.group} role="group" aria-label={T('lang.label')}>
            {LANGS.map((lang) => (
                <button
                    key={lang}
                    type="button"
                    onClick={() => choose(lang)}
                    className={styles.button}
                    data-active={lang === current}
                    aria-pressed={lang === current}
                    lang={lang}
                >
                    {LANG_LABELS[lang]}
                </button>
            ))}
        </div>
    );
}
