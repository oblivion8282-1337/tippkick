'use client';

import { useState } from 'react';
import Link from 'next/link';

import { authClient, requestVerificationEmail } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Bestätige deine E-Mail</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-4 text-sm">
            <p>
              Wir haben dir einen Bestätigungs-Link geschickt (in der Entwicklung wird er in der Konsole ausgegeben).
              Bitte klicke darauf, um dein Konto zu aktivieren.
            </p>
            <LinkButton href="/login" variant="outline" className="w-full">
              Zum Login
            </LinkButton>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Registrieren</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name (dein Tipper-Name)</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" disabled={pending}>
              {pending ? 'Registriere …' : 'Konto erstellen'}
            </Button>

            <Link href="/login" className="text-muted-foreground text-center text-sm hover:underline">
              Schon ein Konto? Einloggen.
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
