'use client';

import { useState } from 'react';
import Link from 'next/link';

import { authClient, requestVerificationEmail } from '@/lib/auth-client';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkButton } from '@/components/link-button';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      setPending(false);
      setError(error.message ?? 'Registrierung fehlgeschlagen.');
      return;
    }

    await requestVerificationEmail(email);
    setPending(false);
    setDone(true);
  }

  if (done) {
    return (
      <AuthShell eyebrow="Fast geschafft" title="Bestätige deine E-Mail" subtitle="Wir haben dir einen Link geschickt.">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Klicke auf den Bestätigungs-Link in der Mail, um dein Konto zu aktivieren. In der Entwicklung wird er
          in der Konsole ausgegeben.
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
      title="Konto erstellen"
      subtitle="Tipper-Name, E-Mail, Passwort — fertig."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            autoComplete="nickname"
            placeholder="So kennt dich die Tippleitung"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          className="bg-pitch hover:bg-pitch/90 text-pitch-foreground h-11 w-full text-base shadow-[0_8px_24px_-8px_oklch(0.5_0.11_152/0.6)]"
        >
          {pending ? 'Registriere …' : 'Konto erstellen'}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="hover:text-foreground hover:underline">
            Schon ein Konto? Einloggen.
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}