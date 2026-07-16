'use client';

import { Menu } from '@base-ui/react/menu';
import { useRouter } from 'next/navigation';
import { LogOut, Moon, Settings, Sun, User as UserIcon } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { useTheme } from '@/components/theme-provider';

/**
 * Nutzer-Menü rechts in der Leiste: Trigger ist Avatar/profilfoto (sonst User-Icon);
 ** darin Profil (Einstellungen), Hell/Dunkel umschalten und Abmelden.
 */
export function UserMenu({ userName, userImage }: { userName: string; userImage?: string | null }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  async function onLogout() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Konto-Menü"
        className="border-border/60 bg-muted/40 hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/40 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border transition-colors outline-none focus-visible:ring-4"
      >
        {userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userImage} alt={userName} className="h-full w-full object-cover" />
        ) : (
          <UserIcon className="h-5 w-5" />
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50 min-w-52 outline-none">
          <Menu.Popup className="border-border bg-popover text-popover-foreground ring-border/40 space-y-0.5 rounded-lg border p-1.5 shadow-lg">
            <div className="text-muted-foreground truncate px-3 py-2 text-xs">{userName}</div>
            <MenuSeparator />
            <Menu.LinkItem
              href="/einstellungen"
              className="focus:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none"
            >
              <Settings className="h-4 w-4" />
              Einstellungen
            </Menu.LinkItem>
            <Menu.Item
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="focus:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Helles Theme' : 'Dunkles Theme'}
            </Menu.Item>
            <MenuSeparator />
            <Menu.Item
              onClick={onLogout}
              className="text-destructive focus:bg-destructive/10 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MenuSeparator() {
  return <div className="bg-border/60 my-1 h-px" />;
}
