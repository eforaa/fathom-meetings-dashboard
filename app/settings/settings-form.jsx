'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '../lang-context';
import styles from './settings.module.css';

//format date and time into a readable format
function formatMoment(iso) {
    //if date is missing
    if (!iso) return 'never';

    return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

//form for connecting and disconnecting a Fathom account
export default function SettingsForm({ account }) {
    const T = useT();
    const router = useRouter();

    const [apiKey, setApiKey] = useState('');
    //which button is working right now
    const [busy, setBusy] = useState(null);
    const [message, setMessage] = useState(null);
    //live text while the archive is loading
    const [progress, setProgress] = useState(null);

    //one place for all requests
    async function send(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));

        //error handling
        if (!response.ok) throw new Error(data.error ?? 'Something went wrong');
        return data;
    }

    //downloading the whole archive piece by piece
    //every call continues from the saved cursor, so it survives timeouts
    async function backfillLoop() {
        setBusy('backfill');
        setMessage(null);

        let saved = 0;

        try {
            let done = false;

            while (!done) {
                const result = await send('/api/account/backfill', { method: 'POST' });

                done = result.done;
                saved += result.inserted ?? 0;
                setProgress(T('settings.archiveProgress', { n: result.total ?? saved }));
            }

            setProgress(null);
            setMessage({ ok: true, text: T('settings.archiveDone', { n: saved }) });
            router.refresh();
        } catch (error) {
            //cursor is stored on the server, nothing is lost
            setProgress(null);
            setMessage({
                ok: false,
                text: `Archive loading paused: ${error.message}. Press "Load archive" to continue.`,
            });
        } finally {
            setBusy(null);
        }
    }

    //saving the key
    async function connect() {
        setBusy('connect');
        setMessage(null);

        try {
            await send('/api/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey }),
            });

            //field is cleared, the key is never shown again
            setApiKey('');
            setMessage({ ok: true, text: T('settings.keySaved') });
            router.refresh();

            //the archive starts downloading right away
            await backfillLoop();
        } catch (error) {
            setMessage({ ok: false, text: error.message });
            setBusy(null);
        }
    }

    //removing the key
    async function disconnect() {
        setBusy('disconnect');
        setMessage(null);

        try {
            await send('/api/account', { method: 'DELETE' });
            setMessage({ ok: true, text: T('settings.keyRemoved') });
            router.refresh();
        } catch (error) {
            setMessage({ ok: false, text: error.message });
        } finally {
            setBusy(null);
        }
    }

    //loading meetings without waiting for the night run
    async function syncNow() {
        setBusy('sync');
        setMessage(null);

        try {
            const result = await send('/api/account/sync', { method: 'POST' });
            setMessage({
                ok: true,
                text: `Done. ${result.inserted} new, ${result.skipped} already known.`,
            });
            router.refresh();
        } catch (error) {
            //timeout comes back without a message
            setMessage({
                ok: false,
                text: error.message === 'Something went wrong'
                    ? T('settings.syncSlow')
                    : error.message,
            });
        } finally {
            setBusy(null);
        }
    }

    return (
        <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{T('settings.account')}</h2>

            {account ? (
                //key is already saved
                <div className={styles.card}>
                    <dl className={styles.facts}>
                        <div className={styles.fact}>
                            <dt className={styles.factLabel}>{T('settings.key')}</dt>
                            <dd className={styles.factValue}>••••{account.api_key_hint}</dd>
                        </div>
                        <div className={styles.fact}>
                            <dt className={styles.factLabel}>{T('settings.meetings')}</dt>
                            <dd className={styles.factValue}>{account.meetings_count}</dd>
                        </div>
                        <div className={styles.fact}>
                            <dt className={styles.factLabel}>{T('settings.lastSync')}</dt>
                            <dd className={styles.factValue}>{formatMoment(account.last_synced_at)}</dd>
                        </div>
                    </dl>

                    {account.last_sync_status === 'failed' && (
                        <p className={styles.syncError}>{T('settings.syncFailed', { error: account.last_sync_error })}</p>
                    )}

                    <div className={styles.actions}>
                        {/* archive download is not finished: offer to continue */}
                        {account.backfill_done === false && (
                            <button
                                type="button"
                                onClick={backfillLoop}
                                disabled={busy !== null}
                                className={styles.primary}
                            >
                                {busy === 'backfill' ? T('settings.loadingArchive') : T('settings.loadArchive')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={syncNow}
                            disabled={busy !== null}
                            className={styles.primary}
                        >
                            {busy === 'sync' ? T('settings.syncing') : T('settings.syncNow')}
                        </button>
                        <button
                            type="button"
                            onClick={disconnect}
                            disabled={busy !== null}
                            className={styles.danger}
                        >
                            {busy === 'disconnect' ? T('settings.removing') : T('settings.disconnect')}
                        </button>
                    </div>
                </div>
            ) : (
                //no key yet
                <div className={styles.card}>
                    <p className={styles.hint}>{T('settings.keyHint')}</p>

                    <div className={styles.field}>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder={T('settings.keyPlaceholder')}
                            className={styles.input}
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={connect}
                            disabled={busy !== null || !apiKey.trim()}
                            className={styles.primary}
                        >
                            {busy === 'connect' ? T('settings.checking') : T('settings.checkSave')}
                        </button>
                    </div>

                    <p className={styles.note}>{T('settings.keyNote')}</p>
                </div>
            )}

            {/* live progress while the archive is loading */}
            {progress && <p className={styles.ok}>{progress}</p>}

            {message && (
                <p className={message.ok ? styles.ok : styles.error}>{message.text}</p>
            )}
        </section>
    );
}
