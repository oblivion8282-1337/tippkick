import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';

import { getCompetitionsAdmin } from '@/lib/admin';
import { getManageableSeason, getSeasons } from '@/lib/matchdays';
import { getRoundOverview, getTipptageOverview } from '@/lib/rounds';
import { COMPETITION_SHORT, LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { formatDateRange, formatDateTime } from '@/lib/datetime';
import { AssignRoundForm } from '@/components/assign-round-form';
import { CreateSeasonForm } from '@/components/create-season-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { createTipptagAction } from '@/app/(admin)/admin/actions';

/** ISO-Jahr-Woche als Gruppierungsschlüssel (für die Wochenend-Cluster). */
function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default async function SpieltagePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonParam } = await searchParams;
  const [seasons, manageable] = await Promise.all([getSeasons(), getManageableSeason()]);

  if (seasons.length === 0 || !manageable) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Admin" title="Spieltage & Tipptage" />
        <CreateSeasonForm />
      </div>
    );
  }

  // Gewählte Saison (aus Query) oder die vom System vorgeschlagene.
  const season = seasons.find((s) => s.id === seasonParam) ?? manageable;

  const [rounds, tipptage, competitions] = await Promise.all([
    getRoundOverview(season.id),
    getTipptageOverview(season.id),
    getCompetitionsAdmin(season.id),
  ]);

  // Spieltage nach Woche clustern (Datumssortierung bleibt erhalten).
  const clusters: { key: string; rows: typeof rounds }[] = [];
  for (const row of rounds) {
    const key = weekKey(row.startDate);
    const last = clusters[clusters.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      clusters.push({ key, rows: [row] });
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Spieltage & Tipptage"
        description="Importierte Spieltage nach Datum, gruppiert in Tipptage. BL startet später als die 2. Liga – die Anfangsphase zeigt nur L2."
      />

      <SeasonSwitcher seasons={seasons} activeId={season.id} />

      <Card>
        <CardHeader className="border-b border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Spieltage ({rounds.length})
            </CardTitle>
            {competitions.length > 0 && (
              <form action={createTipptagAction} className="flex items-center gap-2">
                <input type="hidden" name="competitionId" value={competitions[0].id} />
                <Label htmlFor="count" className="text-muted-foreground whitespace-nowrap text-xs">
                  Tipptage anlegen:
                </Label>
                <Input id="count" name="count" type="number" min={1} max={100} defaultValue={34} className="h-8 w-20" />
                <Button type="submit" size="sm">
                  Anlegen
                </Button>
              </form>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {clusters.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Keine Spieltage für diese Saison. Der OpenLigaDB-Import läuft automatisch (Cron);
              in Dev per <code className="font-mono">pnpm sync:results</code> anstoßen.
            </p>
          ) : (
            clusters.map((cluster) => {
              const first = cluster.rows[0];
              const last = cluster.rows[cluster.rows.length - 1];
              const hasBL = cluster.rows.some((r) => r.league === 'BL');
              const hasL2 = cluster.rows.some((r) => r.league === 'L2');
              return (
                <div key={cluster.key} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">
                      {formatDateRange(first.startDate, last.endDate)}
                    </span>
                    {hasL2 && !hasBL && (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                        Nur 2. Liga · BL noch nicht gestartet
                      </span>
                    )}
                  </div>
                  <div className="border-border/60 bg-card overflow-hidden rounded-xl border">
                    {cluster.rows.map((row) => {
                      const total = row.fixtures.length;
                      const finished = row.fixtures.filter((f) => f.status === 'FINISHED').length;
                      return (
                        <details key={row.id} className="group border-border/40 border-b last:border-b-0">
                          <summary className="hover:bg-muted/30 flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
                            <span
                              className="font-medium"
                              aria-hidden="true"
                              style={{ color: row.league === 'BL' ? 'var(--primary)' : undefined }}
                            >
                              {COMPETITION_SHORT[row.competition.key]} ·{' '}
                              {row.league ? LEAGUE_SECTION_LABELS[row.league] : 'Wettbewerb'}
                            </span>
                            <span className="text-muted-foreground">{row.number}. Spieltag</span>
                            <span className="text-muted-foreground tabular-nums">
                              {total} Partien{finished > 0 ? ` · ${finished}/${total} Ergebnisse` : ''}
                            </span>
                            <span className="ml-auto">
                              <AssignRoundForm
                                sectionId={row.id}
                                tipptage={tipptage}
                                current={row.matchday?.id ?? null}
                              />
                            </span>
                          </summary>
                          <ul className="border-border/40 divide-y divide-border/30 border-t">
                            {row.fixtures.map((f) => (
                              <li key={f.id} className="flex items-center gap-3 py-2 pr-4 pl-10 text-sm">
                                <time className="text-muted-foreground w-40 shrink-0 font-mono tabular-nums">
                                  {formatDateTime(f.kickoff)}
                                </time>
                                <span className="text-right font-medium truncate">{f.homeTeam}</span>
                                <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                                  {f.homeGoals ?? '–'} : {f.awayGoals ?? '–'}
                                </span>
                                <span className="flex-1 truncate font-medium">{f.awayTeam}</span>
                                {f.resultSource === 'MANUAL' && (
                                  <span className="text-muted-foreground shrink-0 text-xs">manuell</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Saison-Wechsler (Tabs) + Formular zum Anlegen einer neuen Saison. */
function SeasonSwitcher({ seasons, activeId }: { seasons: { id: string; name: string }[]; activeId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-1 text-sm">Saison:</span>
          {seasons.map((s) => {
            const active = s.id === activeId;
            return (
              <Link
                key={s.id}
                href={`/admin/spieltage?season=${s.id}`}
                className={
                  active
                    ? 'bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm font-medium'
                    : 'hover:bg-muted rounded-md px-3 py-1 text-sm transition-colors'
                }
              >
                {s.name}
              </Link>
            );
          })}
        </div>
        <CreateSeasonForm />
      </CardContent>
    </Card>
  );
}
