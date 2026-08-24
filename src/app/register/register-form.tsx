'use client';

import { useState } from 'react';
import Link from 'next/link';

import { authClient } from '@/lib/auth-client';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkButton } from '@/components/link-button';

/**
 * Zugang aktivieren oder anlegen. Zwei Wege über EIN Formular:
 * 1. Tippleitung hat das Konto vorbereitet (ohne Passwort) → hier Erstpasswort
 *    setzen (Identifikation per Name ODER E-Mail) — der Regelfall im Verein.
 * 2. Komplett neue E-Mail → klassische Registrierung (wartet auf Freischaltung).
 */
export function RegisterForm() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const isEmail = identifier.includes('@');

    if (!isEmail) {
      // Vorbereiteten Zugang aktivieren (Name) — Passwort selbst wählen.
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      setPending(false);
      if (res.ok) {
        const data = (await res.json()) as { name: string };
        setDoneName(data.name);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Aktivieren fehlgeschlagen.');
      return;
    }

    // E-Mail: klassische Registrierung (Name aus E-Mail-Präfix, änderbar später).
    const name = identifier.split('@')[0];
    const { error } = await authClient.signUp.email({ name, email: identifier, password });
    setPending(false);
    if (error) {
      setError(error.message ?? 'Registrierung fehlgeschlagen.');
      return;
    }
    setDoneName(name);
  }

  if (doneName !== null) {
    return (
      <AuthShell eyebrow="Fast geschafft" title="Passwort gesetzt" subtitle="Dein Zugang ist aktiv.">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Willkommen, {doneName}! Du kannst dich jetzt einloggen — mit deinem Namen oder deiner E-Mail-Adresse.
        </p>
        <LinkButton href="/login" variant="outline" className="mt-6 w-full">
          Zum Login
        </LinkButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Willkommen im Verein"
      title="Zugang aktivieren"
      subtitle="Dein Konto ist vorbereitet — setze hier dein Passwort."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="identifier">Tipper-Name oder E-Mail</Label>
          <Input
            id="identifier"
            required
            autoComplete="username"
            placeholder="z. B. Willi60"
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
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
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
          {pending ? 'Moment …' : 'Passwort setzen'}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="hover:text-foreground hover:underline">
            Schon ein Passwort gesetzt? Einloggen.
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
