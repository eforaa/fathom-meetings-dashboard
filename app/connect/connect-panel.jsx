'use client';

import { useState } from 'react';
import styles from './connect.module.css';

function CopyField({ label, value }) {
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
          {done ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
    </div>
  );
}

export default function ConnectPanel({ url, token, base }) {
  const [showManual, setShowManual] = useState(false);

  return (
    <div className={styles.wrap}>
      {/* the easy path: one ready link with the key already inside */}
      <div className={styles.card}>
        <span className={styles.step}>Ваша ссылка для подключения</span>
        <CopyField value={url} />
        <p className={styles.hint}>Ключ уже внутри ссылки — вставлять отдельно ничего не нужно.</p>
      </div>

      <div className={styles.steps}>
        <h2 className={styles.stepsTitle}>Как подключить (один раз)</h2>
        <ol className={styles.list}>
          <li>Откройте Claude → Settings (Настройки) → Connectors.</li>
          <li>Нажмите «Add custom connector» (Добавить свой коннектор).</li>
          <li>Вставьте ссылку сверху и сохраните.</li>
          <li>
            Готово. В новом чате напишите: <b>«покажи мои встречи»</b> или{' '}
            <b>«переименуй встречи без названия»</b>.
          </li>
        </ol>
      </div>

      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className={styles.toggle}
      >
        {showManual ? 'Скрыть' : 'Если Claude просит URL и ключ отдельно →'}
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
