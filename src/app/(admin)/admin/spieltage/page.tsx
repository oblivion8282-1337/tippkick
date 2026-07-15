import { CalendarDays, Layers } from 'lucide-react';

import { getCompetitionsAdmin } from '@/lib/admin';
import { getManageableSeason } from '@/lib/matchdays';
import { getRoundOverview, getTipptageOverview, resultState } from '@/lib/rounds';
import { COMPETITION_SHORT, LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { formatDateRange, formatDateTime } from '@/lib/datetime';
import { AssignRoundForm } from '@/components/assign-round-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { createTipptagAction, setTipptagDeadlineAction } from '@/app/(admin)/admin/actions';

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ISO-Jahr-Woche als Gruppierungsschlüssel (für die Wochenend-Cluster). */
function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default async function SpieltagePage() {
  const season = await getManageableSeason();
  if (!season) {
    return <p className="text-muted-foreground text-sm">Keine Saison vorhanden.</p>;
  }

  const [rounds, tipptage, competitions] = await Promise.all([
    getRoundOverview(season.id),
    getTipptageOverview(season.id),
    getCompetitionsAdmin(),
  ]);

  const tipptagOptions = tipptage.map((t) => ({ id: t.id, number: t.number }));
  const resultLabels = { none: 'offen', partial: 'teilweise', complete: 'fertig' } as const;

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

      <Card>
        <CardHeader className="border-b border-border/40">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Tipptage ({tipptage.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {tipptage.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Noch keine Tipptage. Unten Spieltage importieren und dann hier gruppieren.
            </p>
          ) : (
            <ul className="space-y-2">
              {tipptage.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 border-border/60 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-display font-semibold">{t.number}. Tipptag</span>
                  <span className="text-muted-foreground">
                    {t._count.sections} Spieltag(e) · Deadline {formatDateTime(t.deadlineAt)}
                  </span>
                  <form action={setTipptagDeadlineAction} className="ml-auto flex items-center gap-2">
                    <input type="hidden" name="matchdayId" value={t.id} />
                    <Input
                      name="deadlineAt"
                      type="datetime-local"
                      defaultValue={toLocalInput(t.deadlineAt)}
                      className="h-8 w-44"
                      aria-label="Deadline"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Deadline
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {competitions.length > 0 && (
            <form action={createTipptagAction} className="flex flex-wrap items-end gap-3 pt-2">
              <input type="hidden" name="competitionId" value={competitions[0].id} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="number">Neuer Tipptag (Nr.)</Label>
                <Input id="number" name="number" type="number" min={1} className="w-28" />
              </div>
              <Button type="submit" size="sm">
                Tipptag anlegen
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/40">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Spieltage ({rounds.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {clusters.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Keine Spieltage. Erst über den OpenLigaDB-Import laden (Admin-Startseite).
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
                  <ul className="border-border/60 bg-card divide-y divide-border/40 overflow-hidden rounded-xl border">
                    {cluster.rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                      >
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
                          {row._count.fixtures} Partien · {resultLabels[resultState(row._count.fixtures, row.finished)]}
                        </span>
                        <span className="ml-auto">
                          <AssignRoundForm
                            sectionId={row.id}
                            tipptage={tipptagOptions}
                            current={row.matchday?.id ?? null}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
