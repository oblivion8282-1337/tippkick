'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarClock, House, Trophy, Users } from 'lucide-react';

/**
 * Admin-Seitenleiste: Grundorientierung im Admin-Bereich (wo bin ich / wo kann ich hin). Desktop: feste Spalte links; Mobil: horizontale Leiste unter der
 * Hauptnavigation. Tiefe Seiten (Tipptag-Detail) markieren keinen Punkt — dort
 * zeigt der Breadcrumb den Rest des Wegs.
 */
const ITEMS = [
  { label: 'Start', href: '/admin', icon: House, match: (p: string, s: string) => p === '/admin' && !s.includes('tab=') },
  {
    label: 'Wettbewerbe',
    href: '/admin?tab=wettbewerbe',
    icon: Trophy,
    match: (p: string, s: string) => p === '/admin' && s.includes('tab=wettbewerbe'),
  },
  {
    label: 'Spieltage & Zuordnung',
    href: '/admin/spieltage',
    icon: CalendarClock,
    match: (p: string) => p.startsWith('/admin/spieltage'),
  },
  {
    label: 'Tipper',
    href: '/admin?tab=tipper',
    icon: Users,
    match: (p: string, s: string) => p === '/admin' && s.includes('tab=tipper'),
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return (
    <>
      {/* Desktop: vertikale Sidebar */}
      <nav
        aria-label="Admin-Bereiche"
        className="border-border/40 hidden w-56 shrink-0 border-r lg:block"
      >
        <ul className="sticky top-20 space-y-1">
          {ITEMS.map(({ label, href, icon: Icon, match }) => {
            const active = match(pathname, search);
            return (
              <li key={label}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'bg-primary/10 text-primary flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm'
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobil: horizontale Leiste unter der Hauptnavigation */}
      <nav
        aria-label="Admin-Bereiche"
        className="border-border/40 -mx-4 flex gap-1 overflow-x-auto border-b px-4 pb-2 lg:hidden"
      >
        {ITEMS.map(({ label, href, icon: Icon, match }) => {
          const active = match(pathname, search);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bg-primary/10 text-primary flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap'
                  : 'text-muted-foreground bg-muted/40 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap'
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
