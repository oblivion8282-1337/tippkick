'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Zustandsloser Dark/Light-Umschalter. Die Icon-Sichtbarkeit läuft rein über
 * Tailwind-dark-Varianten (kein React-State, kein Hydration-Mismatch). Beim
 * Klick wird das aktuelle Theme am <html>-class-Attribut abgelesen.
 */
export function ThemeToggle() {
  const { setTheme } = useTheme();

  function toggle() {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'light' : 'dark');
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Zwischen Hell- und Dunkel-Modus wechseln"
      onClick={toggle}
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}
