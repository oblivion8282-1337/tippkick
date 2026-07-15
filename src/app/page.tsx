import Link from 'next/link';

import { getSession } from '@/lib/session';
import { Button } from '@/components/ui/button';

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Tippverein</h1>
        <p className="text-muted-foreground mt-2">Online tippen statt Excel per Mail.</p>
      </div>

      <div className="flex gap-3">
        {session ? (
          <Button render={<Link href="/dashboard" />}>Zum Tippbereich</Button>
        ) : (
          <>
            <Button render={<Link href="/login" />}>Einloggen</Button>
            <Button variant="outline" render={<Link href="/register" />}>
              Registrieren
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
