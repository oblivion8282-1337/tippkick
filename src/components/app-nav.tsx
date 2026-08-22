'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Shield } from 'lucide-react';

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
  // Aktiver Nav-Punkt: /admin/* markiert Admin, alles andere Dashboard.
  const pathname = usePathname();
  const active = (href: string) =>
    href === '/admin' ? pathname.startsWith('/admin') : pathname.startsWith('/dashboard');

  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/dashboard" className="shrink-0">
            <Wordmark size="lg" />
          </Link>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <LinkButton
            href="/dashboard"
            variant="ghost"
            className={`${active('/dashboard') ? 'bg-primary/15 text-primary' : ''} px-2 sm:px-3`}
            aria-current={active('/dashboard') ? 'page' : undefined}
            aria-label="Dashboard"
          >
            {/* Mobil nur Icon, ab sm mit Text — Navigation darf auf Handy nicht fehlen */}
            <LayoutDashboard className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Dashboard</span>
          </LinkButton>
          {isAdmin && (
            <LinkButton
              href="/admin"
              variant="ghost"
              className={`${active('/admin') ? 'bg-primary/15 text-primary' : ''} px-2 sm:px-3`}
              aria-current={active('/admin') ? 'page' : undefined}
              aria-label="Admin"
            >
              <Shield className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Admin</span>
            </LinkButton>
          )}
          <div className="bg-border/60 mx-1 hidden h-7 w-px sm:mx-2 sm:block" aria-hidden="true" />
          <UserMenu userName={userName} userImage={userImage} />
        </div>
      </div>
    </header>
  );
}
