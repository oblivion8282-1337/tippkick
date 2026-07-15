import { prisma } from '@/lib/prisma';
import { DEADLINE_OFFSET_MS } from '@/lib/constants';
import { spanFromKickoffs } from '@/lib/import-helpers';
import type { Prisma } from '@/generated/prisma/client';

/** Include für die Spieltag-Übersicht (nur Zählwerte, keine Partien-Zeilen laden). */
const roundOverviewInclude = {
  competition: { include: { season: true } },
  matchday: { select: { id: true } },
  _count: { select: { fixtures: true } },
} satisfies Prisma.MatchdaySectionInclude;

export type RoundRow = Prisma.MatchdaySectionGetPayload<{ include: typeof roundOverviewInclude }> & {
  finished: number; // Anzahl beendeter Partien (separat via groupBy ermittelt)
};

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
 * Tipptag und Ergebnis-Fortschritt (Zählwerte statt geladener Partien). Die
 * Early-L2-only-Phase zeigt sich von selbst, da BL-Sections erst später beginnen.
 */
export async function getRoundOverview(seasonId: string): Promise<RoundRow[]> {
  const [sections, finishedGroups] = await Promise.all([
    prisma.matchdaySection.findMany({
      where: { competition: { seasonId } },
      include: roundOverviewInclude,
      orderBy: [{ startDate: 'asc' }, { league: 'asc' }, { number: 'asc' }],
    }),
    prisma.fixture.groupBy({
      by: ['sectionId'],
      where: { section: { competition: { seasonId } }, status: 'FINISHED' },
      _count: { _all: true },
    }),
  ]);
  const finishedBySection = new Map(finishedGroups.map((g) => [g.sectionId, g._count._all]));
  return sections.map((s) => ({ ...s, finished: finishedBySection.get(s.id) ?? 0 }));
}

/** Alle Tipptage (Matchdays) einer Saison, sortiert nach Nummer. */
export async function getTipptageOverview(seasonId: string) {
  return prisma.matchday.findMany({
    where: { competition: { seasonId } },
    orderBy: { number: 'asc' },
    include: { _count: { select: { sections: true } } },
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
