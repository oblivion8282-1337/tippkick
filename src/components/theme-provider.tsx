'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';

/**
 * Minimaler Theme-Provider ( Ersatz für next-themes ). Dark/Light wird als Klasse
 * am <html> gesetzt ('dark'/'light') und in localStorage gespeichert.
 *
 * Der Anti-Flacker-Skript läuft via useServerInsertedHTML OUTSIDE des React-Baums
 * → kein React-19-Warning „Encountered a script tag while rendering React component"
 * (next-themes 0.4.6 injiziert ihn innerhalb des Baums und triggert genau das).
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'tippkick-theme';

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({
  theme: 'dark',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  // No-Flash: Theme aus localStorage lesen + Klasse setzen, noch vor Hydration.
  useServerInsertedHTML(() => (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');document.documentElement.classList.add(t==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
      }}
    />
  ));

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const next: Theme = stored === 'light' ? 'light' : 'dark';
    // Einmaliges Übernehmen der gespeicherten Preference beim Mounten (Client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(next);
    applyTheme(next);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage nicht verfügbar (z. B. Private Mode) — nur in-Session halten.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
