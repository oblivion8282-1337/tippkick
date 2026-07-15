import { getSession } from '@/lib/session';
import { LinkButton } from '@/components/link-button';

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
          <LinkButton href="/dashboard">Zum Tippbereich</LinkButton>
        ) : (
          <>
            <LinkButton href="/login">Einloggen</LinkButton>
            <LinkButton href="/register" variant="outline">
              Registrieren
            </LinkButton>
          </>
        )}
      </div>
    </main>
  );
}
