'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

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
