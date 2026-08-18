import { cookies } from 'next/headers';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { LangProvider } from './lang-context';
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const ui = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
//serif display face for headings — the editorial redesign
const display = Source_Serif_4({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600'],
  variable: '--font-display',
  display: 'swap',
});

//the tab title follows the chosen language too
export async function generateMetadata() {
  const lang = await getLang();

  return {
    title: t(lang, 'meta.title'),
    description: t(lang, 'meta.description'),
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#14171b' },
  ],
};

export default async function RootLayout({ children }) {
  //the theme is stored in a cookie, so the server can set it here directly
  //no flash, no inline script, nothing for React to warn about
  const stored = (await cookies()).get('theme')?.value;
  const theme = stored === 'light' || stored === 'dark' ? stored : undefined;

  //the language comes from its own cookie, the same way — decided once here and
  //handed down, so server and client render the same words
  const lang = await getLang();

  return (
    <html
      lang={lang}
      data-theme={theme}
      className={`${ui.variable} ${mono.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}