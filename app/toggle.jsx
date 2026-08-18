'use client';

import { useEffect, useState } from 'react';
import { useT } from './lang-context';
import styles from './toggle.module.css';

// Cycling through three states keeps "follow the system" reachable.
// A plain light/dark switch would lose it after the first click.
const ORDER = ['system', 'light', 'dark'];

//the three states, named in the dictionaries under theme.*

// The theme lives in a cookie so the server can render it with no flash.
function readTheme() {
  const match = document.cookie.match(/(?:^|; )theme=(light|dark)/);
  return match ? match[1] : 'system';
}

export default function ThemeToggle() {
  const T = useT();
  const [theme, setTheme] = useState('system');

  // The server has already set data-theme from the cookie; this only syncs
  // the button so it shows the right icon.
  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);

    // The cookie is read by the server on the next load; setting the
    // attribute here makes the change show at once, without a reload.
    if (next === 'system') {
      document.cookie = 'theme=; path=/; max-age=0; SameSite=Lax';
      delete document.documentElement.dataset.theme;
    } else {
      document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.dataset.theme = next;
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className={styles.button}
      title={T(`theme.${theme}`)}
      aria-label={T(`theme.${theme}`)}
    >
      {theme === 'system' && <SystemIcon />}
      {theme === 'light' && <SunIcon />}
      {theme === 'dark' && <MoonIcon />}
    </button>
  );
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 14h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5v1.2M8 13.3v1.2M14.5 8h-1.2M2.7 8H1.5M12.6 3.4l-.85.85M4.25 11.75l-.85.85M12.6 12.6l-.85-.85M4.25 4.25l-.85-.85"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 9.6A5.8 5.8 0 016.4 2.5a5.8 5.8 0 107.1 7.1z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}