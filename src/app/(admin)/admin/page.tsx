import Link from 'next/link';
import { CalendarClock, Check, Download, Users } from 'lucide-react';

import { getManageableSeason } from '@/lib/matchdays';
import {
  getCompetitionsOverview,
  getTipperList,
  getTipperStats,
  getTipptagTippers,
  getUpcomingTipptage,
} from '@/lib/dashboard';
import { COMPETITION_LABELS, COMPETITION_ORDER, COMPETITION_SHORT } from '@/lib/constants';
import { formatCountdown, formatDateTime } from '@/lib/datetime';
import { ConfirmButton } from '@/components/confirm-button';
import { CreateSeasonForm } from '@/components/create-season-form';
import { RoleSelectForm } from '@/components/role-select-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { getSession } from '@/lib/session';
import { approveUserAction, deleteUserAction, rejectUserAction } from '@/app/(admin)/admin/actions';

export default async function AdminHomePage() {
  const season = await getManageableSeason();
  if (!season) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Tippleitung" title="Admin" />
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground mb-4 text-sm">Noch keine Saison vorhanden.</p>
            <CreateSeasonForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [competitions, upcoming, tipperStats, tippers] = await Promise.all([
    getCompetitionsOverview(season.id),
    getUpcomingTipptage(season.id),
    getTipperStats(),
    getTipperList(),
  ]);
  const compByKey = new Map(competitions.map((c) => [c.key, c]));
  const selfId = (await getSession())?.user.id;
  // Tipp-Status für den nächsten anstehenden Tipptag (✓ getippt / ausstehend).
  const nextTipptag = upcoming[0];
  const nextTipped = nextTipptag ? await getTipptagTippers(nextTipptag.id) : new Set<string>();
  const pending = tippers.filter((u) => !u.approved);
  const active = tippers.filter((u) => u.approved);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Tippleitung" title="Admin" description={`Saison ${season.name}`} />

      {/* Nächste Deadlines (competitions-übergreifend) */}
      <Card>
        <CardHeader className="border-b border-border/40">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Nächste Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground px-6 py-8 text-sm">
              Keine offenen Tipptage. Spieltage noch gruppieren?{' '}
              <Link href="/admin/spieltage" className="text-primary underline">
                Zur Gruppierung
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {upcoming.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                  <span className="bg-muted rounded px-2 py-0.5 text-xs font-semibold">
                    {COMPETITION_SHORT[u.competitionKey]}
                  </span>
                  <Link href={`/admin/matchdays/${u.id}`} className="hover:underline">
                    <span className="font-display font-semibold">Tipptag {u.number}</span>
                  </Link>
                  <span className="text-muted-foreground tabular-nums">{u.fixtureCount} Partien</span>
                  <span className="text-muted-foreground tabular-nums">
                    {u.tippersTipped}/{tipperStats.tippers} getippt
                  </span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {formatCountdown(u.deadlineAt)} · {formatDateTime(u.deadlineAt)}
                  </span>
                  <LinkButton href={`/admin/matchdays/${u.id}/export`} size="sm" variant="outline">
                    <Download className="h-4 w-4" />
                    Excel
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Wettbewerbe */}
      <Card>
        <CardHeader className="border-b border-border/40">
          <CardTitle>Wettbewerbe</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <ul className="divide-y divide-border/40">
            {COMPETITION_ORDER.map((key) => {
              const c = compByKey.get(key);
              const active = Boolean(c && c.sourceShortcuts.length > 0);
              return (
                <li key={key} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                  <span className="font-medium">{COMPETITION_LABELS[key]}</span>
                  {active && c ? (
                    <>
                      <span className="text-muted-foreground tabular-nums">
                        {c._count.matchdays} Tipptage · {c._count.sections} Spieltage importiert
                      </span>
                      <LinkButton href="/admin/spieltage" size="sm" className="ml-auto">
                        Spieltage gruppieren
                      </LinkButton>
                    </>
                  ) : (
                    <span className="text-muted-foreground ml-auto text-xs">
                      {c ? 'ohne Quelle' : 'deaktiviert'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Tipper */}
      <Card>
        <CardHeader className="border-b border-border/40">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Tipper · {tipperStats.tippers} (+{tipperStats.admins} Tippleitung)
            {pending.length > 0 && (
              <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                {pending.length} wartet
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {pending.length > 0 && (
            <>
              <p className="text-muted-foreground px-6 py-2 text-xs font-medium tracking-wide uppercase">
                Wartet auf Freischaltung
              </p>
              <ul className="divide-y divide-border/40 border-t border-border/40">
                {pending.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground truncate">{u.email}</span>
                    <span className="ml-auto flex gap-2">
                      <form action={approveUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <Button type="submit" size="sm">
                          Freischalten
                        </Button>
                      </form>
                      <form action={rejectUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <ConfirmButton confirm={`${u.name} ablehnen und löschen?`} variant="destructive" size="sm">
                          Ablehnen
                        </ConfirmButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {active.length === 0 ? (
            <p className="text-muted-foreground px-6 py-8 text-sm">Noch keine Tipper freigeschaltet.</p>
          ) : (
            <ul className="divide-y divide-border/40 border-t border-border/40">
              {active.map((u) => {
                const isAdmin = u.role === 'admin';
                const isSelf = u.id === selfId;
                const tipped = nextTipptag ? nextTipped.has(u.id) : null;
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                    <span className="font-medium">
                      {u.name}
                      {isSelf && <span className="text-muted-foreground ml-1 text-xs">(du)</span>}
                    </span>
                    <span className="text-muted-foreground truncate">{u.email}</span>
                    {nextTipptag && (
                      <span
                        className={tipped ? 'text-primary inline-flex items-center gap-1 text-xs' : 'text-muted-foreground text-xs'}
                        title={`Tipptag ${nextTipptag.number}`}
                      >
                        {tipped ? (
                          <>
                            <Check className="h-3 w-3" /> getippt
                          </>
                        ) : (
                          `Tipptag ${nextTipptag.number}: offen`
                        )}
                      </span>
                    )}
                    {isSelf ? (
                      <span
                        className={
                          isAdmin
                            ? 'bg-primary/15 text-primary ml-auto rounded px-2 py-0.5 text-xs font-medium'
                            : 'bg-muted text-muted-foreground ml-auto rounded px-2 py-0.5 text-xs'
                        }
                      >
                        {isAdmin ? 'Tippleitung' : 'Tipper'}
                      </span>
                    ) : (
                      <span className="ml-auto flex items-center gap-2">
                        <RoleSelectForm userId={u.id} role={u.role ?? 'user'} />
                        <form action={deleteUserAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <ConfirmButton confirm={`${u.name} endgültig entfernen (inkl. Tipps)?`} variant="destructive" size="sm">
                            Entfernen
                          </ConfirmButton>
                        </form>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
