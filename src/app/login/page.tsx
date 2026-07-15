'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Einloggen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" disabled={pending}>
              {pending ? 'Einloggen …' : 'Einloggen'}
            </Button>

            <div className="text-muted-foreground flex flex-col gap-1 text-sm">
              <Link href="/forgot-password" className="hover:underline">
                Passwort vergessen?
              </Link>
              <Link href="/register" className="hover:underline">
                Noch kein Konto? Jetzt registrieren.
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
