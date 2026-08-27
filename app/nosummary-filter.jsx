'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
//same look as the "needs a name" toggle — one filter chip, one style
import styles from './nameless-filter.module.css';

//a quick toggle that narrows the list to meetings that have no summary yet —
//Fathom hasn't written one, or it was cleared. A fast way to find the calls
//still missing their конспект and fill them in.
export default function NoSummaryFilter({ count = 0 }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const T = useT();
  const on = searchParams.get('nosummary') === '1';

  function toggle() {
    const next = new URLSearchParams(searchParams.toString());
    if (on) next.delete('nosummary');
    else next.set('nosummary', '1');
    router.push(next.toString() ? `/?${next.toString()}` : '/');
  }

  return (
    <button type="button" onClick={toggle} data-active={on} className={styles.btn}>
      {T('nosummary.button')}
      {count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  );
}
