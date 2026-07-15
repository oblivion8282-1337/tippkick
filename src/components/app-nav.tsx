'use client';

import Link from 'next/link';

import { LinkButton } from '@/components/link-button';
import { UserMenu } from '@/components/user-menu';
import { Wordmark } from '@/components/wordmark';

export function AppNav({
  userName,
  userImage,
  isAdmin,
}: {
  userName: string;
  userImage?: string | null;
  isAdmin: boolean;
}) {
  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/dashboard" className="shrink-0">
            <Wordmark size="lg" />
          </Link>
          <span className="text-muted-foreground hidden truncate text-base md:inline">
            Hallo, <span className="text-foreground font-medium">{userName}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <LinkButton href="/dashboard" variant="ghost" className="hidden sm:inline-flex">
            Dashboard
          </LinkButton>
          {isAdmin && (
            <LinkButton href="/admin" variant="ghost" className="hidden sm:inline-flex">
              Admin
            </LinkButton>
          )}
          <div className="bg-border/60 mx-1 hidden h-7 w-px sm:mx-2 sm:block" aria-hidden="true" />
          <UserMenu userName={userName} userImage={userImage} />
        </div>
      </div>
    </header>
  );
}
