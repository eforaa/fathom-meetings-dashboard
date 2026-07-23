import { db } from './supabase.js';
import { encryptSecret, decryptSecret, secretHint } from './secrets.js';

//base API of url
const FATHOM_BASE_URL = 'https://api.fathom.ai/external/v1';

//checking the key with one request before saving it
//without this a typo stays invisible until the next night run
export async function verifyApiKey(apiKey) {
    try {
        const response = await fetch(`${FATHOM_BASE_URL}/meetings?limit=1`, {
            headers: { 'X-Api-Key': apiKey },
            cache: 'no-store',
        });

        //Fathom did not accept the key
        if (response.status === 401 || response.status === 403) {
            return { ok: false, error: 'Fathom rejected this key' };
        }

        //something else went wrong
        if (!response.ok) {
            return { ok: false, error: `Fathom responded with ${response.status}` };
        }

        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not reach Fathom' };
    }
}

//data for the settings page
//the key itself is never selected here
export async function getAccount(userEmail) {
    const { data } = await db
        .from('fathom_accounts')
        .select('user_email, api_key_hint, last_synced_at, last_sync_status, last_sync_error, meetings_count, backfill_done, updated_at')
        .eq('user_email', userEmail)
        .maybeSingle();

    return data ?? null;
}

//one account with a decrypted key, used by backfill
export async function getAccountWithKey(userEmail) {
    const { data } = await db
        .from('fathom_accounts')
        .select('user_email, api_key_encrypted, last_synced_at, backfill_cursor, backfill_done')
        .eq('user_email', userEmail)
        .maybeSingle();

    if (!data) return null;

    return {
        userEmail: data.user_email,
        apiKey: decryptSecret(data.api_key_encrypted),
        lastSyncedAt: data.last_synced_at,
        backfillCursor: data.backfill_cursor,
        backfillDone: data.backfill_done === true,
    };
}

//saving a checked key, replacing the old one if it exists
export async function saveApiKey(userEmail, apiKey) {
    const { error } = await db.from('fathom_accounts').upsert(
        {
            user_email: userEmail,
            api_key_encrypted: encryptSecret(apiKey),
            api_key_hint: secretHint(apiKey),
            //cursor is reset, so the new account is loaded from the beginning
            last_synced_at: null,
            last_sync_status: null,
            last_sync_error: null,
            //full archive download starts over with a new key
            backfill_cursor: null,
            backfill_done: false,
        },
        { onConflict: 'user_email' },
    );

    //error handling
    if (error) throw new Error(`Cannot save the key: ${error.message}`);
}

//disconnecting an account
//meetings already downloaded are left in the database
export async function removeApiKey(userEmail) {
    const { error } = await db
        .from('fathom_accounts')
        .delete()
        .eq('user_email', userEmail);

    //error handling
    if (error) throw new Error(`Cannot remove the key: ${error.message}`);
}

//all accounts with keys, used by ingest
export async function listAccountsWithKeys() {
    const { data, error } = await db
        .from('fathom_accounts')
        .select('user_email, api_key_encrypted, last_synced_at');

    //error handling
    if (error) throw new Error(`Cannot read accounts: ${error.message}`);

    const accounts = [];

    for (const row of data ?? []) {
        try {
            accounts.push({
                userEmail: row.user_email,
                apiKey: decryptSecret(row.api_key_encrypted),
                lastSyncedAt: row.last_synced_at,
            });
        } catch {
            //one broken row should not stop the other accounts
            console.error(`accounts: cannot decrypt the key of ${row.user_email}`);
        }
    }

    return accounts;
}

//writing down how the last sync finished
//the settings page shows it to the person
export async function recordSync(userEmail, { ok, error, meetingsCount, syncedAt }) {
    await db
        .from('fathom_accounts')
        .update({
            last_synced_at: syncedAt ?? new Date().toISOString(),
            last_sync_status: ok ? 'ok' : 'failed',
            last_sync_error: ok ? null : String(error).slice(0, 500),
            //count is not touched when the sync failed
            ...(meetingsCount === undefined ? {} : { meetings_count: meetingsCount }),
        })
        .eq('user_email', userEmail);
}

//backfill progress: cursor after every page, done at the end
export async function saveBackfillProgress(userEmail, cursor, done) {
    const { error } = await db
        .from('fathom_accounts')
        .update({ backfill_cursor: cursor, backfill_done: done })
        .eq('user_email', userEmail);

    if (error) throw new Error(`Cannot save backfill progress: ${error.message}`);
}

//remembering where the incremental sync should pick up later
//set at backfill start: everything after this moment comes from normal sync
export async function markBackfillStart(userEmail) {
    await db
        .from('fathom_accounts')
        .update({ last_synced_at: new Date().toISOString(), last_sync_status: 'ok' })
        .eq('user_email', userEmail);
}
