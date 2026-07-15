import { notFound } from 'next/navigation';

import { activateMatchdayAction, addFixtureAction, deleteFixtureAction } from '@/app/(admin)/admin/actions';
import { getMatchdayAdmin } from '@/lib/admin';
import { formatDateTime } from '@/lib/datetime';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{matchday.number}. Spieltag</h1>
          <p className="text-muted-foreground text-sm">
            {matchday.season.name} · Deadline {formatDateTime(matchday.deadlineAt)}
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
          <CardTitle>Partien ({matchday.fixtures.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {matchday.fixtures.length === 0 && (
            <p className="text-muted-foreground text-sm">Noch keine Partien erfasst.</p>
          )}
          <ul className="divide-y rounded-lg border">
            {matchday.fixtures.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">
                  <span className="text-muted-foreground mr-2">{f.league === 'BL' ? 'BL' : '2.L'}</span>
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

          <form
            action={addFixtureAction.bind(null, matchday.id)}
            className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="league">Liga</Label>
              <select
                id="league"
                name="league"
                defaultValue="BL"
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
              >
                <option value="BL">1. Liga</option>
                <option value="L2">2. Liga</option>
              </select>
            </div>
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
