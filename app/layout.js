import { cookies } from 'next/headers';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { LangProvider } from './lang-context';
import { DM_Sans, JetBrains_Mono, Golos_Text } from 'next/font/google';
import './globals.css';

//Шрифты AiVocado (DESIGN.md: DM Sans + JetBrains Mono).
//
//DM Sans кириллицы НЕ содержит — ни в одной сборке, я проверила файлы пакета.
//В mind-doc за ней стоит системный шрифт, и весь русский текст там рисует
//Segoe UI или SF. Здесь так нельзя: интерфейс почти целиком кириллический,
//и это был бы не фирменный вид, а его отсутствие.
//
//Поэтому вторым в стопке — Golos Text: он уже входит в их набор шрифтов и
//перечислен в DESIGN.md. Браузер подбирает семейство поглифно: латиница
//(имена, AiS, Zoom) достаётся DM Sans, кириллица — Golos Text.
const ui = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
});
const cyr = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-cyr',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
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
      className={`${ui.variable} ${cyr.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}