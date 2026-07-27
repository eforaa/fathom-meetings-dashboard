'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './title-control.module.css';

//the meeting title, with the full "which name wins" story visible.
//a meeting always keeps its ORIGINAL recorded name; on top of that the user
//can apply Claude's generated suggestion (🤖) or type their own — and revert
//to the original at any time. nothing is ever lost.
//
//props:
//  shown        — the title currently displayed (from meetingTitle)
//  source       — where it came from: custom_title | ai_title | title | fathom_title | none
//  original     — the original recorded name, or null for nameless calls
//  aiTitle      — Claude's generated suggestion, if any
export default function TitleControl({ meetingId, shown, source, original, aiTitle }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(shown === 'No name' ? '' : shown);
  const [busy, setBusy] = useState(false);

  //one call for every action the picker offers
  async function send(body, nextText) {
    setBusy(true);
    try {
      await fetch(`/api/meetings/${meetingId}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (nextText !== undefined) setText(nextText);
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const badge =
    source === 'custom_title'
      ? { icon: '✍️', label: 'Ваше название' }
      : source === 'ai_title'
        ? { icon: '🤖', label: 'Сгенерировано Клодом' }
        : source === 'none'
          ? { icon: '•', label: 'Без названия' }
          : { icon: '📅', label: 'Оригинал из Fathom' };

  //what a "revert to original" would reveal — only offer it when it changes something
  const canRevert = source === 'custom_title' || source === 'ai_title';
  //Claude's suggestion is worth offering only when it isn't already the one shown
  const canUseAi = aiTitle && source !== 'ai_title';

  if (editing) {
    return (
      <div className={styles.editor}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send({ title: text }, text);
            if (event.key === 'Escape') setEditing(false);
          }}
          placeholder="Название встречи"
          className={styles.input}
          autoFocus
          disabled={busy}
        />
        <div className={styles.actions}>
          <button type="button" onClick={() => send({ title: text }, text)} disabled={busy} className={styles.save}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={styles.cancel}>
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>{shown}</h1>
        <span className={styles.badge} title={badge.label}>
          <span aria-hidden>{badge.icon}</span>
          {badge.label}
        </span>
      </div>

      <div className={styles.controls}>
        <button type="button" onClick={() => setEditing(true)} className={styles.btn}>
          ✎ Своё название
        </button>

        {canUseAi && (
          <button
            type="button"
            onClick={() => send({ useAi: true })}
            disabled={busy}
            className={styles.btn}
            title={aiTitle}
          >
            🤖 Вариант Клода
          </button>
        )}

        {canRevert && original && (
          <button
            type="button"
            onClick={() => send({ revert: true })}
            disabled={busy}
            className={styles.btn}
            title={original}
          >
            📅 Вернуть оригинал
          </button>
        )}
      </div>

      {/* the original is always shown for reference, so nothing feels lost */}
      {original && source !== 'title' && source !== 'fathom_title' && (
        <p className={styles.original}>Записано в Fathom как «{original}»</p>
      )}
    </div>
  );
}
