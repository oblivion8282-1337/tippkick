'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarClock, House, Shuffle, Trophy, Users } from 'lucide-react';

export type SidebarCompetition = { id: string; seasonId: string; label: string; active: boolean };

/**
 * Admin-Seitenleiste — Grundorientierung in drei Ebenen:
 *   Wettbewerbe ▸ <Wettbewerb> ▸ Tipptage / Zuordnung
 * Desktop: feste Spalte links (einklappbar). Mobil: horizontale Leiste; die
 * Unterebenen übernimmt dort die Tab-Navigation der jeweiligen Seite.
 */
export function AdminSidebar({ competitions }: { competitions: SidebarCompetition[] }) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const competitionParam = searchParams.get('competition');

  const inSpieltage = pathname.startsWith('/admin/spieltage');
  // Aktiver Wettbewerb: expliziter Parameter, sonst (ohne Param) der erste aktive.
  const activeCompetition =
    competitions.find((c) => c.id === competitionParam) ??
    (inSpieltage ? (competitions.find((c) => c.active) ?? competitions[0]) : undefined);

  const wettbewerbeActive = (pathname === '/admin' && tab === 'wettbewerbe') || inSpieltage;
  const startActive = pathname === '/admin' && !tab;

  const compHref = (c: SidebarCompetition) => `/admin/spieltage?season=${c.seasonId}&competition=${c.id}`;
  const subHref = (c: SidebarCompetition, sub: 'tipptage' | 'zuordnung') =>
    sub === 'tipptage' ? compHref(c) : `${compHref(c)}&tab=zuordnung`;
  const compIsActive = (c: SidebarCompetition) => activeCompetition?.id === c.id;
  const subIsActive = (c: SidebarCompetition, sub: 'tipptage' | 'zuordnung') =>
    inSpieltage && compIsActive(c) && (sub === 'zuordnung' ? tab === 'zuordnung' : tab !== 'zuordnung');

  return (
    <>
      {/* Desktop: vertikale Sidebar */}
      <nav aria-label="Admin-Bereiche" className="border-border/40 hidden w-60 shrink-0 border-r lg:block">
        <ul className="sticky top-20 space-y-1">
          <li>
            <SidebarLink href="/admin" icon={House} label="Start" active={startActive} />
          </li>
          <li>
            {/* Wettbewerbe samt Unterebene immer sichtbar — der Inhalt ist klein,
                ein Einklapp-Toggle versteckt nur die Navigation (Tipptage/Zuordnung). */}
            <Link
              href="/admin?tab=wettbewerbe"
              aria-current={wettbewerbeActive && !activeCompetition ? 'page' : undefined}
              className={`hover:bg-muted/60 flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                wettbewerbeActive ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Trophy className="h-4 w-4 shrink-0" />
              Wettbewerbe
            </Link>
            <ul className="mt-0.5 space-y-0.5 pl-3">
              {competitions.length === 0 && (
                <li className="text-muted-foreground px-3 py-1.5 text-xs">Noch keine Wettbewerbe</li>
              )}
              {competitions.map((c) => (
                <li key={c.id}>
                  <Link
                    href={compHref(c)}
                    className={`hover:bg-muted/60 flex flex-1 items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-4 text-sm ${
                      compIsActive(c) ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                    } ${c.active ? '' : 'opacity-50'}`}
                  >
                    {c.label}
                  </Link>
                  <ul className="mt-0.5 space-y-0.5 pl-8">
                    <li>
                      <SidebarLink href={subHref(c, 'tipptage')} icon={CalendarClock} label="Tipptage" small active={subIsActive(c, 'tipptage')} />
                    </li>
                    <li>
                      <SidebarLink href={subHref(c, 'zuordnung')} icon={Shuffle} label="Zuordnung" small active={subIsActive(c, 'zuordnung')} />
                    </li>
                  </ul>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <SidebarLink
              href="/admin?tab=tipper"
              icon={Users}
              label="Tipper"
              active={pathname === '/admin' && tab === 'tipper'}
            />
          </li>
        </ul>
      </nav>

      {/* Mobil: horizontale Leiste — Unterebenen regelt die Tab-Nav der Seite */}
      <nav
        aria-label="Admin-Bereiche"
        className="border-border/40 -mx-4 flex gap-1 overflow-x-auto border-b px-4 pb-2 lg:hidden"
      >
        {[
          { label: 'Start', href: '/admin', active: startActive },
          { label: 'Wettbewerbe', href: '/admin?tab=wettbewerbe', active: wettbewerbeActive && !activeCompetition },
          ...(activeCompetition ? [{ label: activeCompetition.label, href: compHref(activeCompetition), active: true }] : []),
          { label: 'Tipper', href: '/admin?tab=tipper', active: pathname === '/admin' && tab === 'tipper' },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={
              item.active
                ? 'bg-primary/10 text-primary flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap'
                : 'text-muted-foreground bg-muted/40 flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm whitespace-nowrap'
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  small,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'bg-primary/10 text-primary flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm'
      }
    >
      {small ? <Icon className="h-3.5 w-3.5 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
      {label}
    </Link>
  );
}
