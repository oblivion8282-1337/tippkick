import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ShieldCheck } from 'lucide-react';

import { getCompetitions, isTippable, pickDefaultMatchday } from '@/lib/matchdays';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Wordmark } from '@/components/wordmark';
import { cn } from '@/lib/utils';
import type { CompetitionKey } from '@/generated/prisma/client';

type SectionInfo = { league: 'BL' | 'L2' | null; number: number; fixtures: { id: string }[] };
type MatchdaySummary = {
  md: {
    id: string;
    number: number;
    deadlineAt: Date;
    startDate: Date;
    endDate: Date;
    sections: SectionInfo[];
  };
  tipped: number;
  total: number;
  open: boolean;
};

/** Läd einen Tipptag (Wettbewerb + Nummer) inkl. Tipp-Fortschritt eines Nutzers. */
async function loadMatchdaySummary(competitionId: string, number: number, userId: string): Promise<MatchdaySummary | null> {
  const md = await prisma.matchday.findFirst({
    where: { competitionId, number },
    select: {
      id: true,
      number: true,
      deadlineAt: true,
      startDate: true,
      endDate: true,
      sections: { select: { league: true, number: true, fixtures: { select: { id: true } } } },
    },
  });
  if (!md) {
    return null;
  }
  const fixtureFilter = { section: { matchdayId: md.id } };
  const [tipped, total] = await Promise.all([
    prisma.tip.count({ where: { userId, fixture: fixtureFilter } }),
    prisma.fixture.count({ where: fixtureFilter }),
  ]);
  return { md, tipped, total, open: isTippable(md.deadlineAt) };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ matchday?: string }>;
}) {
  const { matchday: matchdayParam } = await searchParams;
  const session = await requireUser();
  const competitions = await getCompetitions();

  if (competitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Wordmark size="lg" className="text-muted-foreground" />
        <p className="text-muted-foreground max-w-md">
          Aktuell sind keine Wettbewerbe freigeschaltet. Sobald die Tippleitung eine Saison anlegt, erscheinen hier
          die Tipptage.
        </p>
      </div>
    );
  }

  // Pro Wettbewerb: Fokus-Tipptag + Fortschritt (für die Wettbewerb-Karten).
  const rows = await Promise.all(
    competitions.map(async (c) => {
      const focus = pickDefaultMatchday(c.matchdays);
      if (!focus) {
        return null;
      }
      const summary = await loadMatchdaySummary(c.id, focus.number, session.user.id);
      return summary ? { c, ...summary } : null;
    }),
  );
  const visibleRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (visibleRows.length === 0) {
    return (
      <div className="text-muted-foreground py-24 text-center">Aktuell keine tippspielfähigen Tipptage.</div>
    );
  }
  const focusRow = visibleRows.find((r) => r.open && r.tipped < r.total) ?? visibleRows[0];

  // Hero = Fokus-Wettbewerb, Tipptag per ?matchday= schaltbar.
  const heroC = focusRow.c;
  const numbers = heroC.matchdays.map((m) => m.number).sort((a, b) => a - b);
  const requested = Number(matchdayParam);
  const selectedNumber = numbers.includes(requested) ? requested : focusRow.md.number;
  const heroSummary = await loadMatchdaySummary(heroC.id, selectedNumber, session.user.id);
  if (!heroSummary) {
    return null;
  }
  const idx = numbers.indexOf(selectedNumber);
  const prevNumber = idx > 0 ? numbers[idx - 1] : null;
  const nextNumber = idx >= 0 && idx < numbers.length - 1 ? numbers[idx + 1] : null;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`Saison ${visibleRows[0]?.c.season.name ?? ''}`}
        title="Dein Wochenende"
        description="Hier landest du auf dem nächsten offenen Tipptag. Tippe ihn jetzt — nach der Deadline geht nichts mehr."
      />

      <WeekendHero
        competitionKey={heroC.key}
        competitionName={heroC.name}
        summary={heroSummary}
        prevNumber={prevNumber}
        nextNumber={nextNumber}
      />

      {visibleRows.length > 1 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">Andere Wettbewerbe</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleRows
              .filter((r) => r.c.key !== heroC.key)
              .map((row) => (
                <CompetitionCard key={row.c.key} row={row} />
              ))}
          </div>
        </section>
      )}

      {session.user.role === 'admin' && (
        <aside className="border-border/60 bg-card/50 flex items-center justify-between gap-4 rounded-2xl border px-5 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-pitch" />
            <div>
              <p className="font-medium">Du bist Tippleitung</p>
              <p className="text-muted-foreground text-sm">
                Verwalte Spieltage oder exportiere Tipps als Excel für die Auswertung.
              </p>
            </div>
          </div>
          <LinkButton href="/admin" variant="outline" size="sm">
            Zum Admin-Bereich
            <ChevronRight />
          </LinkButton>
        </aside>
      )}
    </div>
  );
}

function WeekendHero({
  competitionKey,
  competitionName,
  summary,
  prevNumber,
  nextNumber,
}: {
  competitionKey: CompetitionKey;
  competitionName: string;
  summary: MatchdaySummary;
  prevNumber: number | null;
  nextNumber: number | null;
}) {
  const { md, tipped, total, open } = summary;
  const ratio = total === 0 ? 0 : tipped / total;
  const finished = tipped === total && total > 0;
  const deadlineLabel = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(md.deadlineAt);

  return (
    <article className="from-card via-card to-pitch/5 relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br p-6 shadow-[0_1px_0_oklch(0.21_0.018_160/0.04),0_8px_24px_-12px_oklch(0.21_0.018_160/0.12)] sm:p-10 dark:bg-gradient-to-br dark:from-card dark:via-card dark:to-pitch/10 dark:shadow-[0_1px_0_oklch(0.93_0.01_100/0.04),0_8px_24px_-12px_oklch(0_0_0/0.4)]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <p className="text-muted-foreground flex items-center gap-2 font-mono text-[0.7rem] font-medium tracking-[0.18em] uppercase">
            <CalendarDays className="h-3.5 w-3.5" />
            {competitionName}
          </p>

          {/* Tipptag + Pfeile zum Schalten (flankierend) */}
          <div className="flex items-center gap-3">
            <TipptagArrow dir="prev" target={prevNumber} />
            <h2 className="font-display text-5xl font-semibold tracking-tight sm:text-7xl">
              {md.number}.{' '}
              <span className="text-muted-foreground font-display font-normal">Tipptag</span>
            </h2>
            <TipptagArrow dir="next" target={nextNumber} />
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Deadline <span className="text-foreground font-medium">{deadlineLabel}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-xs">
              {md.sections.map((s) => (s.league ? LEAGUE_SECTION_LABELS[s.league] : 'Liga')).join(' + ')}
            </span>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold tabular-nums">
                {tipped}
                <span className="text-muted-foreground text-xl">/{total}</span>
              </span>
              <span className="text-muted-foreground text-sm">getippt</span>
            </div>
            <div className="bg-foreground/10 h-2 max-w-md overflow-hidden rounded-full" aria-hidden="true">
              <div
                className={cn('h-full rounded-full transition-all duration-500 ease-out', finished ? 'bg-pitch' : 'bg-pitch/80')}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end">
          <LinkButton
            href={{ pathname: '/tippen', query: { competition: competitionKey, matchday: md.number } }}
            size="lg"
            className="bg-pitch hover:bg-pitch/90 text-pitch-foreground h-12 px-6 text-base shadow-[0_8px_24px_-8px_oklch(0.5_0.11_152/0.6)]"
          >
            {open ? 'Jetzt tippen' : 'Ansehen'}
            <ChevronRight />
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

/** Pfeil-Link zum Schalten des Tipptags (deaktiviert, wenn kein Ziel). */
function TipptagArrow({ dir, target }: { dir: 'prev' | 'next'; target: number | null }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  const label = dir === 'prev' ? 'Vorheriger Tipptag' : 'Nächster Tipptag';
  if (target === null) {
    return (
      <span
        aria-disabled="true"
        className="text-muted-foreground/30 flex h-9 w-9 items-center justify-center rounded-full"
      >
        <Icon className="h-5 w-5" />
      </span>
    );
  }
  return (
    <Link
      href={{ pathname: '/dashboard', query: { matchday: target } }}
      aria-label={label}
      className="hover:bg-foreground/5 text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full transition-colors"
    >
      <Icon className="h-5 w-5" />
    </Link>
  );
}

function CompetitionCard({
  row,
}: {
  row: {
    c: { key: CompetitionKey; name: string; season: { name: string } };
    md: { number: number; deadlineAt: Date };
    tipped: number;
    total: number;
    open: boolean;
  };
}) {
  return (
    <Link
      href={{ pathname: '/tippen', query: { competition: row.c.key, matchday: row.md.number } }}
      className="group border-border/60 bg-card hover:border-pitch/40 hover:bg-card/80 flex flex-col gap-2 rounded-2xl border p-5 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">{row.c.name}</p>
          <p className="font-display text-xl font-semibold tracking-tight">{row.md.number}. Tipptag</p>
        </div>
        <ChevronRight className="text-muted-foreground group-hover:text-pitch h-5 w-5 transition-colors" />
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>
          {row.tipped}/{row.total} getippt
        </span>
        <span aria-hidden="true">·</span>
        <span>{row.open ? 'offen' : row.tipped === row.total ? 'vollständig' : 'geschlossen'}</span>
      </div>
    </Link>
  );
}
