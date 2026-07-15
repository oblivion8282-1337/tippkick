'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/link-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { cn } from '@/lib/utils';

export function AppNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const router = useRouter();

  async function onLogout() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard" className="shrink-0">
            <Wordmark size="sm" />
          </Link>
          <span className="text-muted-foreground hidden truncate text-sm md:inline">
            Hallo, <span className="text-foreground font-medium">{userName}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <LinkButton href="/dashboard" size="sm" variant="ghost" className="hidden sm:inline-flex">
            Dashboard
          </LinkButton>
          <LinkButton href="/tippen" size="sm" variant="ghost" className="hidden sm:inline-flex">
            Tippen
          </LinkButton>
          {isAdmin && (
            <LinkButton href="/admin" size="sm" variant="ghost" className="hidden md:inline-flex">
              Admin
            </LinkButton>
          )}
          <NavSeparator />
          <LinkButton href="/einstellungen" variant="ghost" size="icon-sm" aria-label="Einstellungen">
            <SettingsIcon />
          </LinkButton>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={onLogout} className={cn('text-muted-foreground hover:text-foreground')}>
            Abmelden
          </Button>
        </div>
      </div>
    </header>
  );
}

function NavSeparator() {
  return <span aria-hidden="true" className="bg-border/60 mx-1 h-5 w-px sm:mx-2" />;
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}