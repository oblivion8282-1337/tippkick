import { prisma } from '@/lib/prisma';
import type { CompetitionKey } from '@/generated/prisma/client';

/** Wettbewerbe der aktuellen Saison (sortiert) inkl. ihrer Spieltage. */
export async function getCompetitions() {
  // Aktuelle Saison = die mit den jüngsten Spieltagen; wir nehmen die neueste Season.
  const season = await prisma.season.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!season) {
    return [];
  }
  return prisma.competition.findMany({
    where: { seasonId: season.id },
    orderBy: { sortOrder: 'asc' },
    include: { matchdays: { orderBy: { number: 'asc' }, select: { number: true, isActive: true, deadlineAt: true } } },
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

/** Aktiver Spieltag eines Wettbewerbs (für Default-Auswahl im Tipper-Bereich). */
export async function getActiveMatchdayForCompetition(competitionKey: CompetitionKey) {
  return prisma.matchday.findFirst({
    where: { competition: { key: competitionKey }, isActive: true },
    include: { competition: true, fixtures: { orderBy: { sortOrder: 'asc' } } },
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
