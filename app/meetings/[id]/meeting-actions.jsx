'use client';

import { useState } from 'react';
import { useT } from '../../lang-context';
import styles from './meeting.module.css';

//builds a clean Markdown digest of the meeting from what's already on the page,
//then lets the user copy it or download a .md — no AI, no server round-trip.
function toMarkdown({ title, date, summary, topics, tasks }) {
  const lines = [`# ${title}`];
  if (date) lines.push('', `_${date}_`);
  if (summary) lines.push('', '## Конспект', '', summary);
  if (topics?.length) {
    lines.push('', '## Темы', '');
    for (const t of topics) lines.push(`- ${t}`);
  }
  if (tasks?.length) {
    lines.push('', '## Задачи', '');
    for (const t of tasks) lines.push(`- [ ] ${t.text}${t.who ? ` — ${t.who}` : ''}`);
  }
  return lines.join('\n');
}

export default function MeetingActions(props) {
  const T = useT();
  const [copied, setCopied] = useState(false);
  const md = toMarkdown(props);

  async function copy() {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; the download still works
    }
  }

  function download() {
    const safe = (props.title || 'meeting').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.actions}>
      <button type="button" onClick={copy} className={styles.actionBtn}>
        {copied ? T('meeting.copied') : T('meeting.copySummary')}
      </button>
      <button type="button" onClick={download} className={styles.actionBtn}>
        {T('meeting.exportMd')}
      </button>
    </div>
  );
}
