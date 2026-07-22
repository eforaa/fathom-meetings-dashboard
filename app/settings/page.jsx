import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClientForServer } from '@/lib/supabase-auth';
import { getAccount } from '@/lib/accounts';
import SettingsForm from './settings-form';
import styles from './settings.module.css';

export const dynamic = 'force-dynamic';

//settings page
export default async function SettingsPage() {
    const supabase = createClientForServer(await cookies());
    const {
        data: { user },
    } = await supabase.auth.getUser();

    //middleware guards this route already
    //the check is here so the page can not render without an email
    if (!user) redirect('/login');

    //account data, without the key itself
    const account = await getAccount(user.email);

    return (
        <main className={styles.page}>
            <Link href="/" className={styles.back}>
                <BackIcon />
                All meetings
            </Link>

            <header className={styles.head}>
                <h1 className={styles.title}>Settings</h1>
                <p className={styles.subtitle}>Signed in as {user.email}</p>
            </header>

            <SettingsForm account={account} />
        </main>
    );
}

//icon for the back link
function BackIcon() {
    return (
        <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={styles.backIcon}
        >
            <path
                d="M10 12L6 8l4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}