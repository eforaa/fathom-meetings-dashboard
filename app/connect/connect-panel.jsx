'use client';

import { useState } from 'react';
import { useT } from '../lang-context';
import styles from './connect.module.css';

function CopyField({ label, value }) {
  const T = useT();
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard blocked — the field is selectable, user can copy by hand
    }
  }

  return (
    <div className={styles.field}>
      {label && <span className={styles.fieldLabel}>{label}</span>}
      <div className={styles.fieldRow}>
        <code className={styles.value}>{value}</code>
        <button type="button" onClick={copy} className={styles.copy}>
          {done ? T('connect.copied') : T('connect.copy')}
        </button>
      </div>
    </div>
  );
}

export default function ConnectPanel({ url, token, base }) {
  const T = useT();
  const [showManual, setShowManual] = useState(false);

  return (
    <div className={styles.wrap}>
      {/* the easy path: one ready link with the key already inside */}
      <div className={styles.card}>
        <span className={styles.step}>{T('connect.yourLink')}</span>
        <CopyField value={url} />
        <p className={styles.hint}>{T('connect.linkHint')}</p>
      </div>

      <div className={styles.steps}>
        <h2 className={styles.stepsTitle}>{T('connect.stepsTitle')}</h2>
        <ol className={styles.list}>
          <li>{T('connect.step1')}</li>
          <li>{T('connect.step2')}</li>
          <li>{T('connect.step3')}</li>
          <li>
            {T('connect.step4a')} <b>{T('connect.step4b')}</b>{' '}
            <b>{T('connect.step4c')}</b>
          </li>
        </ol>
      </div>

      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className={styles.toggle}
      >
        {showManual ? T('connect.hideManual') : T('connect.showManual')}
      </button>

      {showManual && (
        <div className={styles.card}>
          <CopyField label="URL коннектора" value={`${base}/api/mcp/${token}`} />
          <CopyField label="Ключ (Bearer token)" value={token} />
          <p className={styles.hint}>
            В некоторых версиях Claude ключ вставляется отдельным полем — тогда используйте
            эти два значения.
          </p>
        </div>
      )}

      <p className={styles.warn}>
        Ссылка личная — по ней видны только ваши встречи. Не публикуйте её.
      </p>
    </div>
  );
}
