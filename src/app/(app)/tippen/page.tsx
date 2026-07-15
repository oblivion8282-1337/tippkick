import Link from 'next/link';

import { getCompetitions, getMatchdayByNumber, isTippable, pickDefaultMatchday } from '@/lib/matchdays';
import { getMyTips } from '@/lib/tipps';
import { requireUser } from '@/lib/session';
import { formatDateTime } from '@/lib/datetime';
import { COMPETITION_SHORT } from '@/lib/constants';
import { TipMaskForm } from '@/components/tip-mask-form';
import { LinkButton } from '@/components/link-button';
import { Button } from '@/components/ui/button';

type ExistingTip = { homeGoals: number; awayGoals: number };

export default async function TippenPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; matchday?: string }>;
}) {
  const session = await requireUser();
  const sp = await searchParams;

  const competitions = await getCompetitions();
  if (competitions.length === 0) {
    return <p className="text-muted-foreground">Aktuell sind keine Wettbewerbe mit Spieltagen angelegt.</p>;
  }

  // Ausgewählter Wettbewerb (Default: erster mit Spieltagen).
  const selectedKey = competitions.some((c) => c.key === sp.competition)
    ? (sp.competition as (typeof competitions)[number]['key'])
    : competitions[0].key;
  const competition = competitions.find((c) => c.key === selectedKey)!;

  // Ausgewählter Spieltag (Default: aktiver, sonst letzter).
  const numbers = competition.matchdays.map((m) => m.number);
  const requestedNumber = sp.matchday ? Number.parseInt(sp.matchday, 10) : Number.NaN;
  const selectedNumber = numbers.includes(requestedNumber)
    ? requestedNumber
    : (pickDefaultMatchday(competition.matchdays)?.number ?? numbers[numbers.length - 1]);

  const matchday = await getMatchdayByNumber(selectedKey, selectedNumber);
  if (!matchday) {
    return <p className="text-muted-foreground">Spieltag nicht gefunden.</p>;
  }

  const myTips = await getMyTips(session.user.id, matchday.id);
  const existing: Record<string, ExistingTip> = {};
  for (const [fixtureId, tip] of myTips?.tipsByFixture ?? []) {
    existing[fixtureId] = { homeGoals: tip.homeGoals, awayGoals: tip.awayGoals };
  }

  const open = isTippable(matchday.deadlineAt);
  const idx = numbers.indexOf(selectedNumber);
  const prev = idx > 0 ? numbers[idx - 1] : null;
  const next = idx < numbers.length - 1 ? numbers[idx + 1] : null;

  const fixtures = matchday.fixtures.map((f) => ({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam }));

  return (
    <div className="space-y-6">
      {/* Wettbewerbs-Tabs */}
      <nav className="flex flex-wrap gap-2">
        {competitions.map((c) => {
          const active = c.key === selectedKey;
          const target = active ? selectedNumber : pickDefaultMatchday(c.matchdays)?.number;
          return (
            <Link
              key={c.key}
              href={{ query: { competition: c.key, matchday: target } }}
              className={
                'rounded-md border px-3 py-1.5 text-sm ' +
                (active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')
              }
            >
              {COMPETITION_SHORT[c.key]}
            </Link>
          );
        })}
      </nav>

      {/* Spieltag-Pagination */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{matchday.number}. Spieltag</h1>
          <p className="text-muted-foreground text-sm">
            {competition.name} · Deadline {formatDateTime(matchday.deadlineAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {prev !== null ? (
            <LinkButton href={{ query: { competition: selectedKey, matchday: prev } }} variant="outline" size="sm">
              ← {prev}
            </LinkButton>
          ) : (
            <Button variant="outline" size="sm" disabled>
              ←
            </Button>
          )}
          {next !== null ? (
            <LinkButton href={{ query: { competition: selectedKey, matchday: next } }} variant="outline" size="sm">
              {next} →
            </LinkButton>
          ) : (
            <Button variant="outline" size="sm" disabled>
              →
            </Button>
          )}
        </div>
      </div>

      <TipMaskForm fixtures={fixtures} existingTips={existing} open={open} />
    </div>
  );
}
