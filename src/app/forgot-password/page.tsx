'use client';

import { useState } from 'react';
import Link from 'next/link';

import { requestPasswordReset } from '@/lib/auth-client';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
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
    try {
      await requestPasswordReset(email, '/reset-password');
      setDone(true); // bewusst immer Bestätigung zeigen (kein User-Enumeration-Leak)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? `Mail-Versand fehlgeschlagen: ${submitError.message}`
          : 'Mail-Versand fehlgeschlagen. Bitte erneut versuchen.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Kein Stress"
      title="Passwort zurücksetzen"
      subtitle="Wir schicken dir einen Link zum Neusetzen."
    >
      {done ? (
        <p className="text-muted-foreground text-sm leading-relaxed">
          Falls ein Konto mit dieser Adresse existiert, ist gleich eine Mail unterwegs (in der Entwicklung landet der
          Link in der Konsole).
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
            {pending ? 'Senden …' : 'Link anfordern'}
          </Button>
        </form>
      )}
      <p className="text-muted-foreground mt-6 text-center text-sm">
        <Link href="/login" className="hover:text-foreground hover:underline">
          Zurück zum Login
        </Link>
      </p>
    </AuthShell>
  );
}
