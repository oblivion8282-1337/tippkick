'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * next-themes: Default = "dark" (das ist die Dark-Stage-Optik in :root, mit
 * dezentem weißen Verlauf + Pitch-Green-Akzent). Wer auf "light" umschaltet,
 * bekommt das wärmere Off-White-Stadium. Kein System-Tracking — die Wahl
 * bleibt explizit (sonst flippt die Optik auf hellen Browsern).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={['dark', 'light']}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}