'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import styles from './search-box.module.css';

//global search over titles, summaries, transcripts and participants.
//submits to ?q= (server does the actual DB search); Escape / empty clears it.
export default function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const T = useT();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  function submit(next) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.trim();
    if (q) params.set('q', q);
    else params.delete('q');
    router.push(params.toString() ? `/?${params.toString()}` : '/');
  }

  return (
    <input
      type="search"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') submit(value);
        if (event.key === 'Escape') {
          setValue('');
          submit('');
        }
      }}
      placeholder={T('search.placeholder')}
      className={styles.input}
    />
  );
}
