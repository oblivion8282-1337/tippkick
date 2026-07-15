'use client';

import { useState } from 'react';
import Link from 'next/link';

import { requestPasswordReset } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    await requestPasswordReset(email, '/reset-password');
    setPending(false);
    setDone(true); // aus Sicherheitsgründen immer die Bestätigung zeigen
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Passwort zurücksetzen</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-muted-foreground text-sm">
              Falls ein Konto mit dieser Adresse existiert, haben wir dir eine Mail mit einem Link geschickt (in der
              Entwicklung wird er in der Konsole ausgegeben).
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={pending}>
                {pending ? 'Senden …' : 'Link anfordern'}
              </Button>
            </form>
          )}
          <Link href="/login" className="text-muted-foreground mt-4 block text-center text-sm hover:underline">
            Zurück zum Login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
