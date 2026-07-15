import { prisma } from '@/lib/prisma';
import { DEADLINE_OFFSET_MS } from '@/lib/constants';
import { spanFromKickoffs } from '@/lib/import-helpers';
import type { Prisma } from '@/generated/prisma/client';

/** Include für die Spieltag-Übersicht (Partien für die Aufklapp-Detailansicht). */
const roundOverviewInclude = {
  competition: { include: { season: true } },
  matchday: { select: { id: true } },
  fixtures: {
    orderBy: [{ kickoff: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      homeTeam: true,
      awayTeam: true,
      kickoff: true,
      status: true,
      homeGoals: true,
      awayGoals: true,
      resultSource: true,
    },
  },
} satisfies Prisma.MatchdaySectionInclude;

export type RoundRow = Prisma.MatchdaySectionGetPayload<{ include: typeof roundOverviewInclude }>;

export type ResultState = 'none' | 'partial' | 'complete';

/** Ergebnis-Fortschritt eines Spieltags aus Gesamt- und Endspiel-Zählwerten. */
export function resultState(total: number, finished: number): ResultState {
  if (total === 0 || finished === 0) {
    return 'none';
  }
  return finished === total ? 'complete' : 'partial';
}

/**
 * Alle Spieltage (Sections) einer Saison, datum-sortiert, inkl. Zuordnung zu einem
 * Tipptag und Partien (für die aufklappbare Detailansicht). Die Early-L2-only-Phase
 * zeigt sich von selbst, da BL-Sections erst später beginnen.
 */
export async function getRoundOverview(seasonId: string): Promise<RoundRow[]> {
  return prisma.matchdaySection.findMany({
    where: { competition: { seasonId } },
    include: roundOverviewInclude,
    orderBy: [{ startDate: 'asc' }, { league: 'asc' }, { number: 'asc' }],
  });
}

/** Alle Tipptage (Matchdays) einer Saison als Zuordnungsoptionen, sortiert nach Nummer. */
export async function getTipptageOverview(seasonId: string): Promise<{ id: string; number: number }[]> {
  return prisma.matchday.findMany({
    where: { competition: { seasonId } },
    orderBy: { number: 'asc' },
    select: { id: true, number: true },
  });
}

/**
 * Berechnet Start/Ende + Deadline eines Tipptags aus seinen zugeordneten Partien
 * neu. Eine manuell gesetzte Deadline (deadlineManual) wird dabei nicht angetastet.
 */
export async function recalcMatchdaySpan(matchdayId: string): Promise<void> {
  const matchday = await prisma.matchday.findUnique({
    where: { id: matchdayId },
    select: { deadlineManual: true, sections: { include: { fixtures: { select: { kickoff: true } } } } },
  });
  if (!matchday) {
    return;
  }
  const kicks = matchday.sections.flatMap((s) => s.fixtures.map((f) => f.kickoff));
  const span = spanFromKickoffs(kicks);
  if (!span) {
    return; // leerer Tipptag – Datum bleibt, bis Partien zugeordnet sind
  }
  const data: { startDate: Date; endDate: Date; deadlineAt?: Date } = { ...span };
  if (!matchday.deadlineManual) {
    data.deadlineAt = new Date(span.startDate.getTime() - DEADLINE_OFFSET_MS);
  }
  await prisma.matchday.update({ where: { id: matchdayId }, data });
}
