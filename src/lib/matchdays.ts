import { prisma } from '@/lib/prisma';
import type { CompetitionKey } from '@/generated/prisma/client';

/** Aktuelle Saison = die neueste nach createdAt (SSOT für diese Regel). */
export async function getCurrentSeason() {
  return prisma.season.findFirst({ orderBy: { createdAt: 'desc' } });
}

/** "Aktiver Spieltag, sonst letzter" – SSOT-Regel, mehrfach genutzt. */
export function pickActiveMatchday<T extends { isActive: boolean }>(matchdays: T[]): T | undefined {
  return matchdays.find((m) => m.isActive) ?? matchdays[matchdays.length - 1];
}

/** Wettbewerbe der aktuellen Saison (sortiert) inkl. Spieltage + Partieanzahl. */
export async function getCompetitions() {
  const season = await getCurrentSeason();
  if (!season) {
    return [];
  }
  return prisma.competition.findMany({
    where: { seasonId: season.id },
    orderBy: { sortOrder: 'asc' },
    include: {
      matchdays: {
        orderBy: { number: 'asc' },
        select: {
          number: true,
          isActive: true,
          deadlineAt: true,
          _count: { select: { fixtures: true } },
        },
      },
    },
  });
}

/** Spieltag nach Wettbewerbs-Key + Nummer (in der aktuellen Saison). */
export async function getMatchdayByNumber(competitionKey: CompetitionKey, number: number) {
  return prisma.matchday.findFirst({
    where: { competition: { key: competitionKey }, number },
    include: {
      competition: true,
      fixtures: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

/** Alle Spieltage (Admin-Übersicht), mit Wettbewerb + Partieanzahl. */
export async function getMatchdays() {
  return prisma.matchday.findMany({
    orderBy: [{ competition: { sortOrder: 'asc' } }, { number: 'asc' }],
    include: { competition: { include: { season: true } }, _count: { select: { fixtures: true } } },
  });
}

/**
 * Deadline-Logik (SSOT): Tipps sind nur bis zur Deadline möglich.
 * Wird server-seitig im Service erzwungen, UI zeigt nur den Zustand.
 */
export function isTippable(deadlineAt: Date): boolean {
  return new Date() < deadlineAt;
}
