import { notFound } from 'next/navigation';

import { activateMatchdayAction, addFixtureAction, deleteFixtureAction } from '@/app/(admin)/admin/actions';
import { getMatchdayAdmin } from '@/lib/admin';
import { formatDateTime } from '@/lib/datetime';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkButton } from '@/components/link-button';

export default async function MatchdayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchday = await getMatchdayAdmin(id);
  if (!matchday) {
    notFound();
  }

  const allFixtures = matchday.sections.flatMap((s) => s.fixtures);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {matchday.competition.name} – {matchday.number}. Tipptag
          </h1>
          <p className="text-muted-foreground text-sm">
            {matchday.competition.season.name} · Deadline {formatDateTime(matchday.deadlineAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {matchday.isActive ? (
            <span className="text-primary self-center text-sm font-medium">aktiv</span>
          ) : (
            <form action={activateMatchdayAction.bind(null, matchday.id)}>
              <Button type="submit" variant="outline" size="sm">
                Aktivieren
              </Button>
            </form>
          )}
          <LinkButton href={`/admin/matchdays/${matchday.id}/export`} size="sm">
            Tipps als Excel
          </LinkButton>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partien ({allFixtures.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {allFixtures.length === 0 && (
            <p className="text-muted-foreground text-sm">Noch keine Partien erfasst.</p>
          )}
          {matchday.sections.map((section) => (
            <section key={section.id} className="space-y-2">
              <h3 className="text-sm font-medium">
                {section.league ? LEAGUE_SECTION_LABELS[section.league] : 'Wettbewerb'} ·{' '}
                {section.number}. Spieltag
              </h3>
              {section.fixtures.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Partien.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {section.fixtures.map((f) => (
                    <li key={f.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm">
                        {f.homeTeam} : {f.awayTeam}
                      </span>
                      <form action={deleteFixtureAction.bind(null, matchday.id, f.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Löschen
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <form
            action={addFixtureAction.bind(null, matchday.id)}
            className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="kickoff">Anstoß</Label>
              <Input id="kickoff" name="kickoff" type="datetime-local" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="homeTeam">Heim</Label>
              <Input id="homeTeam" name="homeTeam" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="awayTeam">Gast</Label>
              <Input id="awayTeam" name="awayTeam" required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm">
                Partie hinzufügen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}