'use client';

import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * EIN Formular für alles: Name (oder E-Mail) + Passwort.
 * - Konto ohne Passwort → die Eingabe SETZT das Passwort (Erstaktivierung) und
 *   loggt direkt ein.
 * - Konto mit Passwort → ganz normale Anmeldung.
 */
export function LoginForm({ gateMessage }: { gateMessage: string | null }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(gateMessage);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      // 1) Identifikation: Name → E-Mail (better-auth meldet mit E-Mail an).
      let email = identifier;
      let hasPassword = true;
      if (identifier.includes('@')) {
        email = identifier.toLowerCase();
        // E-Mail-Pfad: direkte Anmeldung; ohne Passwort bleibt die Aktivierung
        // bewusst dem Name-Pfad vorbehalten (Neuregistrierung via /register).
      } else {
        const res = await fetch('/api/auth/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier }),
        });
        if (!res.ok) {
          setError('Kein Zugang für diesen Namen gefunden. Bitte wende dich an die Tippleitung.');
          return;
        }
        ({ email, hasPassword } = (await res.json()) as { email: string; hasPassword: boolean });
      }

      // 2) Ohne Passwort: Eingabe setzt das Erstpasswort, danach anmelden.
      if (!hasPassword) {
        const activate = await fetch('/api/auth/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        });
        if (!activate.ok) {
          const data = (await activate.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? 'Passwort konnte nicht gesetzt werden.');
          return;
        }
      }

      // 3) Anmelden.
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        setError(
          hasPassword
            ? 'Login fehlgeschlagen — bitte Passwort prüfen.'
            : 'Login fehlgeschlagen. Bitte versuche es erneut.',
        );
        return;
      }
      window.location.href = '/dashboard';
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell eyebrow="Willkommen zurück" title="Einloggen" subtitle="Tipper-Name und Passwort.">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="identifier">Tipper-Name oder E-Mail</Label>
          <Input
            id="identifier"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="current-password"
            placeholder="Noch kein Passwort? Diese Eingabe setzt es."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="bg-pitch hover:bg-pitch/90 text-pitch-foreground h-11 w-full text-base shadow-[0_8px_24px_-8px_oklch(0_0_0/0.6)]"
        >
          {pending ? 'Moment …' : 'Einloggen'}
        </Button>
      </form>
    </AuthShell>
  );
}
