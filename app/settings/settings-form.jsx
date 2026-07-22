'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
    const router = useRouter();

    const [apiKey, setApiKey] = useState('');
    //which button is working right now
    const [busy, setBusy] = useState(null);
    const [message, setMessage] = useState(null);

    //one place for all requests
    async function send(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));

        //error handling
        if (!response.ok) throw new Error(data.error ?? 'Something went wrong');
        return data;
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
            setMessage({ ok: true, text: 'Key saved. Fathom accepted it.' });
            router.refresh();
        } catch (error) {
            setMessage({ ok: false, text: error.message });
        } finally {
            setBusy(null);
        }
    }

    //removing the key
    async function disconnect() {
        setBusy('disconnect');
        setMessage(null);

        try {
            await send('/api/account', { method: 'DELETE' });
            setMessage({ ok: true, text: 'Key removed. Meetings already downloaded are kept.' });
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
                    ? 'Sync took too long. Part of the meetings loaded, the rest will follow tonight.'
                    : error.message,
            });
        } finally {
            setBusy(null);
        }
    }

    return (
        <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Fathom account</h2>

            {account ? (
                //key is already saved
                <div className={styles.card}>
                    <dl className={styles.facts}>
                        <div className={styles.fact}>
                            <dt className={styles.factLabel}>Key</dt>
                            <dd className={styles.factValue}>••••{account.api_key_hint}</dd>
                        </div>
                        <div className={styles.fact}>
                            <dt className={styles.factLabel}>Meetings</dt>
                            <dd className={styles.factValue}>{account.meetings_count}</dd>
                        </div>
                        <div className={styles.fact}>
                            <dt className={styles.factLabel}>Last sync</dt>
                            <dd className={styles.factValue}>{formatMoment(account.last_synced_at)}</dd>
                        </div>
                    </dl>

                    {account.last_sync_status === 'failed' && (
                        <p className={styles.syncError}>Last sync failed: {account.last_sync_error}</p>
                    )}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            onClick={syncNow}
                            disabled={busy !== null}
                            className={styles.primary}
                        >
                            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                        </button>
                        <button
                            type="button"
                            onClick={disconnect}
                            disabled={busy !== null}
                            className={styles.danger}
                        >
                            {busy === 'disconnect' ? 'Removing…' : 'Disconnect'}
                        </button>
                    </div>
                </div>
            ) : (
                //no key yet
                <div className={styles.card}>
                    <p className={styles.hint}>
                        Paste your Fathom API key to pull your own meetings. Find it in Fathom
                        under settings, in the integrations section.
                    </p>

                    <div className={styles.field}>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder="Fathom API key"
                            className={styles.input}
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={connect}
                            disabled={busy !== null || !apiKey.trim()}
                            className={styles.primary}
                        >
                            {busy === 'connect' ? 'Checking…' : 'Check and save'}
                        </button>
                    </div>

                    <p className={styles.note}>
                        The key is stored encrypted and never shown again — only its last four
                        characters.
                    </p>
                </div>
            )}

            {message && (
                <p className={message.ok ? styles.ok : styles.error}>{message.text}</p>
            )}
        </section>
    );
}