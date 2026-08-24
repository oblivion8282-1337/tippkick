'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ gateMessage }: { gateMessage: string | null }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // Redirect-Grund vom (app)-Layout (requireUser): stummes Bounce vermeiden.
  const [error, setError] = useState<string | null>(gateMessage);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    // Login mit Tipper-Name ODER E-Mail: better-auth braucht die E-Mail —
    // ein Name wird hier serverseitig aufgeloest ( Fall ohne '@').
    let email = identifier;
    if (!identifier.includes('@')) {
      const res = await fetch('/api/auth/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Kein Zugang für diesen Namen gefunden.');
        return;
      }
      email = ((await res.json()) as { email: string }).email;
    }
    const { error } = await authClient.signIn.email({ email, password });
    setPending(false);

    if (error) {
      setError(error.message ?? 'Login fehlgeschlagen.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthShell eyebrow="Willkommen zurück" title="Einloggen" subtitle="Setze deine Tipps fürs Wochenende.">
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
            autoComplete="current-password"
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
          {pending ? 'Einloggen …' : 'Einloggen'}
        </Button>

        <div className="text-muted-foreground flex flex-col gap-1 pt-2 text-sm">
          <Link href="/forgot-password" className="hover:text-foreground hover:underline">
            Passwort vergessen?
          </Link>
          <Link href="/register" className="hover:text-foreground hover:underline">
            Noch kein Konto? Jetzt registrieren.
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
