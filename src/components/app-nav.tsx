'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/link-button';
import { ThemeToggle } from '@/components/theme-toggle';

export function AppNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const router = useRouter();

  async function onLogout() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="font-semibold whitespace-nowrap">
            Tippverein
          </Link>
          <span className="text-muted-foreground hidden truncate text-sm sm:inline">Angemeldet als {userName}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LinkButton href="/einstellungen" variant="outline" size="sm">
            Einstellungen
          </LinkButton>
          {isAdmin && (
            <LinkButton href="/admin" variant="outline" size="sm">
              Admin
            </LinkButton>
          )}
          <Button variant="outline" size="sm" onClick={onLogout}>
            Abmelden
          </Button>
        </div>
      </div>
    </header>
  );
}
