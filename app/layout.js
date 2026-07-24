import { cookies } from 'next/headers';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
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

export const metadata = {
  title: 'Meetings',
  description: 'Searchable archive of recorded meetings',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcfb' },
    { media: '(prefers-color-scheme: dark)', color: '#14171b' },
  ],
};

export default async function RootLayout({ children }) {
  //the theme is stored in a cookie, so the server can set it here directly
  //no flash, no inline script, nothing for React to warn about
  const stored = (await cookies()).get('theme')?.value;
  const theme = stored === 'light' || stored === 'dark' ? stored : undefined;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}