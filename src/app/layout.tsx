import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

import { ThemeProvider } from '@/components/theme-provider';

/*
 * Typografie-System:
 * - Space Grotesk: Display/Headings (geometrisch, leicht retro, eigene Persönlichkeit)
 * - Inter: Body (gut lesbar, solide)
 * - JetBrains Mono: Tipp-Zahlen + Tabellen (Spieltagszettel-Feeling, Tabular-Figures)
 */
const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tippverein',
  description: 'Online tippen statt Excel per Mail.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="theme-ready bg-stage flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}