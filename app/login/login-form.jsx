'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClientForBrowser } from '@/lib/supabase-auth';
import { useT } from '../lang-context';
import LangSwitch from '../lang-switch';
import Avocado from '../avocado';
import styles from './login.module.css';

const MESSAGES = {
    not_allowed:
        'That account is not on the access list. Ask the owner to add your address.',
    exchange_failed: 'Sign-in did not complete. Please try again.',
    missing_code: 'Sign-in did not complete. Please try again.',
};

export default function LoginPage() {
    const T = useT();
    //reading URL parameters
    const searchParams = useSearchParams();
    //react state
    const [busy, setBusy] = useState(false);

    const error = searchParams.get('error');
    //redirection to dashboard
    const next = searchParams.get('next') ?? '/';

    async function signIn() {
        //disabling the button
        setBusy(true);

        //creating supabase client
        const supabase = createClientForBrowser();

        //building callback URL
        const callback = new URL('/auth/callback', window.location.origin);
        //attaching page to return
        callback.searchParams.set('next', next);

        //start logging with google
        const { error: signInError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: callback.toString() },
        });

        if (signInError) setBusy(false);
    }

    return (
        <main className={styles.page}>
            <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <LangSwitch />
                </div>
                <p className={styles.eyebrow}>
                    <Avocado size={14} />
                    {T('login.eyebrow')}
                </p>
                <h1 className={styles.title}>{T('login.title')}</h1>
                <p className={styles.subtitle}>{T('login.subtitle')}</p>

                {error && <p className={styles.error}>{MESSAGES[error] ?? T('login.failed')}</p>}

                <button type="button" onClick={signIn} disabled={busy} className={styles.button}>
                    <GoogleMark />
                    {busy ? T('login.redirecting') : T('login.button')}
                </button>
            </div>
        </main>
    );
}

function GoogleMark() {
    return (
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.63z"
            />
            <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 009 18z"
            />
            <path
                fill="#FBBC05"
                d="M3.96 10.71a5.41 5.41 0 010-3.42V4.96H.96a9 9 0 000 8.08l3-2.33z"
            />
            <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 00.96 4.96l3 2.33C4.67 5.16 6.65 3.58 9 3.58z"
            />
        </svg>
    );
}