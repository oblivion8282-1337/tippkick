import { getSession } from '@/lib/session';
import { LinkButton } from '@/components/link-button';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function Home() {
  const session = await getSession();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Tippverein</h1>
        <p className="text-muted-foreground mt-3 text-lg">Online tippen statt Excel per Mail.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {session ? (
          <LinkButton href="/dashboard" size="lg">
            Zum Tippbereich
          </LinkButton>
        ) : (
          <>
            <LinkButton href="/login" size="lg">
              Einloggen
            </LinkButton>
            <LinkButton href="/register" variant="outline" size="lg">
              Registrieren
            </LinkButton>
          </>
        )}
      </div>
    </main>
  );
}
