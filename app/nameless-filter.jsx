'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import styles from './nameless-filter.module.css';

//a quick toggle that narrows the list to meetings that still need a name —
//"No name" calls and ones showing only Fathom's auto purpose line. Daniil
//asked for a fast way to see the nameless meetings and fix them in a batch.
export default function NamelessFilter({ count = 0 }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const T = useT();
  const on = searchParams.get('nameless') === '1';

  function toggle() {
    const next = new URLSearchParams(searchParams.toString());
    if (on) next.delete('nameless');
    else next.set('nameless', '1');
    router.push(next.toString() ? `/?${next.toString()}` : '/');
  }

  return (
    <button type="button" onClick={toggle} data-active={on} className={styles.btn}>
      {T('nameless.button')}
      {count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  );
}
