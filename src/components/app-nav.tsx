'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function AppNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const router = useRouter();

  async function onLogout() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="font-semibold">
            Tippverein
          </Link>
          <span className="text-muted-foreground text-sm">Angemeldet als {userName}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" render={<Link href="/admin" />}>
              Admin
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onLogout}>
            Abmelden
          </Button>
        </div>
      </div>
    </header>
  );
}
