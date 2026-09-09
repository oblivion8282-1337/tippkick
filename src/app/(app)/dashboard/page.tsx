import Link from 'next/link';
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock, ShieldCheck } from 'lucide-react';

import { getCompetitions, isTippable, pickCurrentMatchday } from '@/lib/matchdays';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { LEAGUE_SECTION_LABELS, ROLE_ADMIN } from '@/lib/constants';
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
    label: string | null;
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
async function loadMatchdaySummary(
  competitionId: string,
  number: number,
  userId: string,
): Promise<MatchdaySummary | null> {
  const md = await prisma.matchday.findFirst({
    where: { competitionId, number },
    select: {
      id: true,
      number: true,
      label: true,
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // ?matchday=N schaltet den Bundesliga-Hero, ?md_<KEY>=N den Tipptag einer Karte.
  const strParam = (key: string): string | undefined => {
    const v = params[key];
    return typeof v === 'string' ? v : undefined;
  };
  const matchdayParam = strParam('matchday');
  const session = await requireUser();
  const competitions = await getCompetitions();

  if (competitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Wordmark size="lg" className="text-muted-foreground" />
        <p className="text-muted-foreground max-w-md">
          Aktuell sind keine Wettbewerbe freigeschaltet. Sobald die Tippleitung eine Saison anlegt, erscheinen hier die
          Tipptage.
        </p>
      </div>
    );
  }

  // Pro Wettbewerb: angezeigter Tipptag (per ?md_<KEY>= schaltbar, Default = Fokus)
  // + Tipp-Fortschritt (für Hero und Wettbewerb-Karten).
  const rows = await Promise.all(
    competitions.map(async (c) => {
      const focus = pickCurrentMatchday(c.matchdays);
      if (!focus) {
        return null;
      }
      const numbers = c.matchdays.map((m) => m.number).sort((a, b) => a - b);
      const requested = Number(strParam(`md_${c.key}`));
      const selectedNumber = numbers.includes(requested) ? requested : focus.number;
      const summary = await loadMatchdaySummary(c.id, selectedNumber, session.user.id);
      if (!summary) {
        return null;
      }
      const idx = numbers.indexOf(selectedNumber);
      return {
        c,
        numbers,
        ...summary,
        prevNumber: idx > 0 ? numbers[idx - 1] : null,
        nextNumber: idx >= 0 && idx < numbers.length - 1 ? numbers[idx + 1] : null,
      };
    }),
  );
  const visibleRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (visibleRows.length === 0) {
    return <div className="text-muted-foreground py-24 text-center">Aktuell keine tippspielfähigen Tipptage.</div>;
  }
  // Hero ist fix die Bundesliga (Vereins-Hauptwettbewerb); CL/DFB stehen darunter.
  // Fallback: erster verfuegbarer Wettbewerb, falls es (noch) keine Bundesliga gibt.
  const focusRow = visibleRows.find((r) => r.c.key === 'BL') ?? visibleRows[0];

  // Hero-Tipptag per ?matchday= schaltbar (innerhalb des Hero-Wettbewerbs).
  const heroRequested = Number(matchdayParam);
  const heroSelected = focusRow.numbers.includes(heroRequested) ? heroRequested : focusRow.md.number;
  const heroSummary =
    heroSelected === focusRow.md.number
      ? focusRow
      : await loadMatchdaySummary(focusRow.c.id, heroSelected, session.user.id);
  if (!heroSummary) {
    return null;
  }
  const heroIdx = focusRow.numbers.indexOf(heroSelected);
  const heroPrev = heroIdx > 0 ? focusRow.numbers[heroIdx - 1] : null;
  const heroNext = heroIdx >= 0 && heroIdx < focusRow.numbers.length - 1 ? focusRow.numbers[heroIdx + 1] : null;

  // Aktuelle md_*-Parameter (bleiben beim Schalten einer Karte erhalten).
  const mdParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('md_') && typeof value === 'string') {
      mdParams[key] = value;
    }
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`Saison ${visibleRows[0]?.c.season.name ?? ''}`}
        title={`Hallo, ${session.user.name ?? session.user.email}`}
      />

      <WeekendHero
        competitionKey={focusRow.c.key}
        competitionName={focusRow.c.name}
        summary={heroSummary}
        prevNumber={heroPrev}
        nextNumber={heroNext}
        focusNumber={focusRow.md.number}
      />

      {visibleRows.length > 1 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">Andere Wettbewerbe</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleRows
              .filter((r) => r.c.key !== focusRow.c.key)
              .map((row) => (
                <CompetitionCard key={row.c.key} row={row} mdParams={mdParams} paramKey={`md_${row.c.key}`} />
              ))}
          </div>
        </section>
      )}

      {session.user.role === ROLE_ADMIN && (
        <aside className="border-border/60 bg-card/50 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-pitch" />
            <div>
              <p className="font-medium">Du bist Tippleitung</p>
              <p className="text-muted-foreground text-sm">
                Verwalte Spieltage oder exportiere Tipps als Excel für die Auswertung.
              </p>
            </div>
          </div>
          <LinkButton href="/admin" variant="outline" size="sm" className="w-full sm:w-auto">
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
  focusNumber,
}: {
  competitionKey: CompetitionKey;
  competitionName: string;
  summary: MatchdaySummary;
  prevNumber: number | null;
  nextNumber: number | null;
  focusNumber: number;
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
    <article className="bg-card border-border/60 relative overflow-hidden rounded-3xl border p-6 shadow-[0_1px_0_oklch(0.21_0.018_255/0.04),0_8px_24px_-12px_oklch(0.21_0.018_255/0.12)] sm:p-10 dark:shadow-[0_1px_0_oklch(0.93_0.01_100/0.04),0_8px_24px_-12px_oklch(0_0_0/0.4)]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          {/* Mobil ohne Einzug (pl-12 wuerde abschneiden), dafuer ist und bleibt
              der Wettbewerbsname EINZEILIG — kein truncate, kein Umbruch. */}
          <p className="text-muted-foreground flex items-center gap-2 font-mono text-[0.7rem] font-medium tracking-[0.14em] whitespace-nowrap uppercase sm:pl-12 sm:tracking-[0.18em]">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {competitionName}
          </p>

          {/* Tipptag + Pfeile zum Schalten (flankierend) */}
          <div className="flex items-center gap-3">
            <TipptagArrow dir="prev" target={prevNumber} focusNumber={focusNumber} />
            {/* whitespace-nowrap: „2. Tipptag" muss EINZEILIG bleiben — der Umbruch
                zwischen Zahl und Wort zerreißt die Überschrift auf schmalen Screens. */}
            <h2 className="font-display text-4xl font-semibold tracking-tight whitespace-nowrap sm:text-7xl">
              {md.label ? (
                md.label
              ) : (
                <>
                  {md.number}. <span className="text-muted-foreground font-display font-normal">Tipptag</span>
                </>
              )}
            </h2>
            <TipptagArrow dir="next" target={nextNumber} focusNumber={focusNumber} />
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-base sm:pl-12">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Deadline <span className="text-foreground font-medium">{deadlineLabel}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-xs">
              {md.sections.map((s) => (s.league ? LEAGUE_SECTION_LABELS[s.league] : 'Liga')).join(' + ')}
            </span>
          </div>

          <div className="space-y-2 pt-1 sm:pl-12">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold tabular-nums">
                {tipped}
                <span className="text-muted-foreground text-xl">/{total}</span>
              </span>
              <span className="text-muted-foreground text-sm">getippt</span>
            </div>
            <div className="bg-foreground/10 h-2 w-full overflow-hidden rounded-full sm:max-w-md" aria-hidden="true">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  finished ? 'bg-pitch' : 'bg-pitch/80',
                )}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <LinkButton
            href={{ pathname: '/tippen', query: { competition: competitionKey, matchday: md.number } }}
            size="lg"
            className="bg-pitch hover:bg-pitch/90 text-pitch-foreground h-12 px-6 text-base shadow-[0_8px_24px_-8px_oklch(0.5_0.11_152/0.6)]"
          >
            {open ? 'Jetzt tippen' : 'Ansehen'}
            <ChevronRight />
          </LinkButton>
          {/* Auswertung erst nach Deadline — vorher wären fremde Tipps sichtbar. */}
          {!open && (
            <LinkButton href={`/auswertung/${md.id}`} variant="outline" className="h-10 px-4 text-sm">
              <BarChart3 className="h-4 w-4" />
              Fieber
            </LinkButton>
          )}
        </div>
      </div>
    </article>
  );
}

/** Pfeil-Link zum Schalten des Tipptags (deaktiviert, wenn kein Ziel). Zurück beim
 * Fokus-Tipptag wird der Parameter weggelassen, damit die URL sauber bleibt und
 * ein späterer Besuch wieder den aktuellen Tipptag zeigt. */
function TipptagArrow({
  dir,
  target,
  focusNumber,
}: {
  dir: 'prev' | 'next';
  target: number | null;
  focusNumber: number;
}) {
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
      href={
        target === focusNumber ? { pathname: '/dashboard' } : { pathname: '/dashboard', query: { matchday: target } }
      }
      aria-label={label}
      className="hover:bg-foreground/5 text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full transition-colors"
    >
      <Icon className="h-5 w-5" />
    </Link>
  );
}

function CompetitionCard({
  row,
  mdParams,
  paramKey,
}: {
  row: {
    c: { key: CompetitionKey; name: string; season: { name: string } };
    md: { id: string; number: number; deadlineAt: Date };
    tipped: number;
    total: number;
    open: boolean;
    prevNumber: number | null;
    nextNumber: number | null;
  };
  mdParams: Record<string, string>;
  paramKey: string;
}) {
  // Beim Schalten einer Karte bleiben die md_*-Stände der anderen Karten erhalten.
  // Zurück beim Fokus-Tipptag fällt der Parameter weg — die URL bleibt sauber und
  // ein späterer Besuch zeigt wieder den aktuellen Tipptag.
  const switchQuery = (target: number) => {
    if (target === row.md.number) {
      const rest = { ...mdParams };
      delete rest[paramKey];
      return { pathname: '/dashboard', query: rest };
    }
    return { pathname: '/dashboard', query: { ...mdParams, [paramKey]: target } };
  };

  return (
    <div className="border-border/60 bg-card hover:border-pitch/40 flex flex-col gap-2 rounded-2xl border p-5 transition-colors">
      <p className="text-muted-foreground text-sm">{row.c.name}</p>
      {/* Tipptag mit Pfeilen — wie im Bundesliga-Hero, nur kompakter. */}
      <div className="flex items-center gap-2">
        <CardArrow dir="prev" target={row.prevNumber} switchQuery={switchQuery} />
        <p className="font-display text-xl font-semibold tracking-tight">{row.md.number}. Tipptag</p>
        <CardArrow dir="next" target={row.nextNumber} switchQuery={switchQuery} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>
            {row.tipped}/{row.total} getippt
          </span>
          <span aria-hidden="true">·</span>
          <span>{row.open ? 'offen' : row.tipped === row.total && row.total > 0 ? 'vollständig' : 'geschlossen'}</span>
        </div>
        {/* Beide Aktionen nebeneinander unten rechts. Fieber erst nach Deadline —
            vorher wären fremde Tipps sichtbar. */}
        <div className="flex items-center gap-2">
          <LinkButton
            href={{ pathname: '/tippen', query: { competition: row.c.key, matchday: row.md.number } }}
            size="sm"
            className="bg-pitch hover:bg-pitch/90 text-pitch-foreground h-8 px-3 text-xs"
          >
            {row.open ? 'Jetzt tippen' : 'Ansehen'}
            <ChevronRight className="size-3.5" />
          </LinkButton>
          {!row.open && (
            <LinkButton href={`/auswertung/${row.md.id}`} variant="outline" size="sm" className="h-8 px-3">
              <BarChart3 className="h-4 w-4" />
              Fieber
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pfeil-Link zum Schalten des Tipptags einer Karte (deaktiviert, wenn kein Ziel). */
function CardArrow({
  dir,
  target,
  switchQuery,
}: {
  dir: 'prev' | 'next';
  target: number | null;
  switchQuery: (target: number) => { pathname: string; query: Record<string, string | number> };
}) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  const label = dir === 'prev' ? 'Vorheriger Tipptag' : 'Nächster Tipptag';
  if (target === null) {
    return (
      <span
        aria-disabled="true"
        className="text-muted-foreground/30 flex h-7 w-7 items-center justify-center rounded-full"
      >
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link
      href={switchQuery(target)}
      aria-label={label}
      className="hover:bg-foreground/5 text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded-full transition-colors"
    >
      <Icon className="size-4" />
    </Link>
  );
}
