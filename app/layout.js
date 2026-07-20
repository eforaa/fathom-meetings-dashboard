import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const ui = Geist({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});
const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const applyStoredTheme = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export const metadata = {
  title: 'Meetings',
  description: 'Searchable archive of recorded meetings',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101317' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}