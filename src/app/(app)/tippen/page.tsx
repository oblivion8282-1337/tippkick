import Link from 'next/link';

import { getCompetitions, getMatchdayByNumber, isTippable, pickDefaultMatchday } from '@/lib/matchdays';
import { weekdayLabelOf } from '@/lib/datetime';
import { getMyTips } from '@/lib/tipps';
import { requireUser } from '@/lib/session';
import { COMPETITION_SHORT, LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { TipMaskForm, type TipSection } from '@/components/tip-mask-form';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/link-button';
import { cn } from '@/lib/utils';

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

  // Ausgewählter Tipptag (Default: aktiver, sonst letzter).
  const numbers = competition.matchdays.map((m) => m.number);
  // isInteger-Guard: "1abc" würde sonst zu 1 matchen, "abc" zu NaN.
  const requestedNumber = sp.matchday && Number.isInteger(Number(sp.matchday)) ? Number(sp.matchday) : Number.NaN;
  const selectedNumber = numbers.includes(requestedNumber)
    ? requestedNumber
    : (pickDefaultMatchday(competition.matchdays)?.number ?? numbers[numbers.length - 1]);

  const matchday = await getMatchdayByNumber(selectedKey, selectedNumber, competition.seasonId);
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

  const sections: TipSection[] = matchday.sections.map((s) => ({
    league: s.league,
    number: s.number,
    fixtures: s.fixtures.map((f) => ({
      id: f.id,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
    })),
  }));

  const allFixtures = sections.flatMap((s) => s.fixtures);
  const dateRange = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(matchday.startDate);
  const endRange = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(matchday.endDate);

  return (
    <div className="space-y-8">
      {/* Wettbewerbs-Tabs */}
      <nav className="border-border/60 -mx-1 flex items-center gap-1 overflow-x-auto px-1">
        {competitions.map((c) => {
          const active = c.key === selectedKey;
          const target = active ? selectedNumber : pickDefaultMatchday(c.matchdays)?.number;
          return (
            <Link
              key={c.key}
              href={{ query: { competition: c.key, matchday: target } }}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {COMPETITION_SHORT[c.key]}
            </Link>
          );
        })}
      </nav>

      {/* Wochenende-Hero */}
      <header className="bg-card border-border/60 relative overflow-hidden rounded-3xl border p-6 shadow-[0_1px_0_oklch(0.21_0.018_255/0.04),0_8px_24px_-12px_oklch(0.21_0.018_255/0.12)] sm:p-8 dark:shadow-[0_1px_0_oklch(0.93_0.01_100/0.04),0_8px_24px_-12px_oklch(0_0_0/0.4)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.18em] uppercase">
              {competition.name} · Tipprunde
            </p>
            <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">
              {matchday.number}. <span className="text-muted-foreground font-display font-normal">Tipptag</span>
            </h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
              <span>{dateRange === endRange ? dateRange : `${dateRange} – ${endRange}`}</span>
              <span aria-hidden="true">·</span>
              <span>
                Deadline {weekdayLabelOf(matchday.deadlineAt)}{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(matchday.deadlineAt)}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="text-foreground font-medium">{allFixtures.length}</span>{' '}
                {allFixtures.length === 1 ? 'Partie' : 'Partien'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-xs">
                {sections.map((s) => (s.league ? LEAGUE_SECTION_LABELS[s.league] : 'Liga')).join(' + ')}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {prev !== null ? (
              <LinkButton
                href={{ query: { competition: selectedKey, matchday: prev } }}
                variant="outline"
                size="icon-sm"
                aria-label="Vorheriger Tipptag"
              >
                <ChevronLeft />
              </LinkButton>
            ) : (
              <Button variant="outline" size="icon-sm" disabled aria-label="Vorheriger Tipptag">
                <ChevronLeft />
              </Button>
            )}
            <span className="text-muted-foreground font-mono text-sm tabular-nums">
              {idx + 1} / {numbers.length}
            </span>
            {next !== null ? (
              <LinkButton
                href={{ query: { competition: selectedKey, matchday: next } }}
                variant="outline"
                size="icon-sm"
                aria-label="Nächster Tipptag"
              >
                <ChevronRight />
              </LinkButton>
            ) : (
              <Button variant="outline" size="icon-sm" disabled aria-label="Nächster Tipptag">
                <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </header>

      <TipMaskForm key={`${selectedKey}-${selectedNumber}`} sections={sections} existingTips={existing} open={open} />
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
