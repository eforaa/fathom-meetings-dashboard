'use client';

import { createClientForBrowser } from '@/lib/supabase-auth';
import styles from './signout.module.css';

export default function SignOut({ email }) {
  async function signOut() {
    const supabase = createClientForBrowser();
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  return (
    <button type="button" onClick={signOut} className={styles.button} title={email}>
      Sign out
    </button>
  );
}