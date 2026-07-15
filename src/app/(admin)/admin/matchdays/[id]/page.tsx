import { notFound } from 'next/navigation';
import { Download, Sparkles, Trash2 } from 'lucide-react';

import { activateMatchdayAction, addFixtureAction, deleteFixtureAction } from '@/app/(admin)/admin/actions';
import { getMatchdayAdmin } from '@/lib/admin';
import { formatDateRange, formatDateTime } from '@/lib/datetime';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';

export default async function MatchdayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchday = await getMatchdayAdmin(id);
  if (!matchday) {
    notFound();
  }

  const allFixtures = matchday.sections.flatMap((s) => s.fixtures);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${matchday.competition.name} · ${matchday.competition.season.name}`}
        title={`${matchday.number}. Tipptag`}
        description={`${formatDateRange(matchday.startDate, matchday.endDate)} · Deadline ${formatDateTime(matchday.deadlineAt)}`}
        actions={
          <>
            {matchday.isActive ? (
              <span className="bg-pitch/10 text-pitch inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                aktiv
              </span>
            ) : (
              <form action={activateMatchdayAction.bind(null, matchday.id)}>
                <Button type="submit" variant="outline" size="sm">
                  Aktivieren
                </Button>
              </form>
            )}
            <LinkButton href={`/admin/matchdays/${matchday.id}/export`} size="sm">
              <Download className="h-4 w-4" />
              Als Excel
            </LinkButton>
          </>
        }
      />

      <Card>
        <CardHeader className="border-b border-border/40">
          <CardTitle>Partien ({allFixtures.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {matchday.sections.map((section) => (
            <section key={section.id} className="relative pl-5">
              <div aria-hidden="true" className="pitch-bar absolute top-2 bottom-2 left-0 w-1 rounded-full" />
              <h3 className="font-display mb-2 text-lg font-semibold tracking-tight">
                {section.league ? LEAGUE_SECTION_LABELS[section.league] : 'Wettbewerb'} ·{' '}
                <span className="text-muted-foreground font-display font-normal">
                  {section.number}. Spieltag
                </span>
              </h3>
              {section.fixtures.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Partien.</p>
              ) : (
                <ul className="border-border/60 bg-card divide-y divide-border/40 overflow-hidden rounded-xl border">
                  {section.fixtures.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-mono tabular-nums">
                        {new Date(f.kickoff).toLocaleString('de-DE', {
                          weekday: 'short',
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="flex-1 truncate">
                        <span className="font-medium">{f.homeTeam}</span>
                        <span className="text-muted-foreground mx-2">:</span>
                        <span className="font-medium">{f.awayTeam}</span>
                      </span>
                      <form action={deleteFixtureAction.bind(null, matchday.id, f.id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Partie löschen">
                          <Trash2 />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <form action={addFixtureAction.bind(null, matchday.id)} className="space-y-4 pt-2">
            <h3 className="font-display text-lg font-semibold tracking-tight">Partie hinzufügen</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="kickoff">Anstoß</Label>
                <Input id="kickoff" name="kickoff" type="datetime-local" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="homeTeam">Heim</Label>
                <Input id="homeTeam" name="homeTeam" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="awayTeam">Gast</Label>
                <Input id="awayTeam" name="awayTeam" required />
              </div>
            </div>
            <Button type="submit" size="sm">
              Partie hinzufügen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}