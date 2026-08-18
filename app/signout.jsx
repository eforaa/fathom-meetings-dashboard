'use client';

import { createClientForBrowser } from '@/lib/supabase-auth';
import { useT } from './lang-context';
import styles from './signout.module.css';

export default function SignOut({ email }) {
  const T = useT();
  async function signOut() {
    const supabase = createClientForBrowser();
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  return (
    <button type="button" onClick={signOut} className={styles.button} title={email}>
      {T('nav.signOut')}
    </button>
  );
}