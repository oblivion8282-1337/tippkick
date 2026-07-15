import { prisma } from '@/lib/prisma';
import type { CompetitionKey, Prisma } from '@/generated/prisma/client';

/**
 * Aktuelle Saison = die Saison, in der der nächste zu tippende Matchday liegt
 * (früheste nicht-abgelaufene Deadline). Damit zeigen Dashboard und Tippen
 * automatisch die richtige Saison, auch wenn parallel Demodaten existieren.
 */
export async function getCurrentSeason() {
  const next = await prisma.matchday.findFirst({
    where: { deadlineAt: { gt: new Date() } },
    orderBy: { deadlineAt: 'asc' },
    select: { competition: { select: { season: true } } },
  });
  return next?.competition.season ?? null;
}

/**
 * Saison für Admin-Seiten (Import + Spieltag-Gruppierung). Anders als
 * getCurrentSeason funktioniert sie auch OHNE zukünftigen Tipptag: bevorzugt die
 * Saison mit dem nächsten Tipp-Termin, sonst die mit importierten Spieltagen,
 * sonst die neueste Saison. Verhindert die Sackgasse „nichts importierbar".
 */
export async function getManageableSeason() {
  const current = await getCurrentSeason();
  if (current) {
    return current;
  }
  const withSections = await prisma.season.findFirst({
    where: { competitions: { some: { sections: { some: {} } } } },
    orderBy: { name: 'desc' },
  });
  return withSections ?? prisma.season.findFirst({ orderBy: { name: 'desc' } });
}

/**
 * SSOT für den `sections`-Include-Shaped von Matchday. Sortiert nach Liga (BL vor L2
 * bzw. Single-Liga `null` zuerst) + Liga-Spieltags-Nummer; Fixtures nach sortOrder.
 * Wird in getMatchdayAdmin / getMatchdayByNumber / getMyTips wiederverwendet.
 */
export const matchdaySectionsInclude = {
  sections: {
    orderBy: [{ league: 'asc' }, { number: 'asc' }],
    include: { fixtures: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.MatchdayInclude;

/**
 * Default-Spieltag für Tipper-Ansicht: der früheste nicht abgelaufene
 * Matchday (sortiert nach Tipptag-Nummer). So landet der Tipper automatisch
 * auf dem nächsten Wochenende, das er noch tippen kann.
 */
export function pickDefaultMatchday<T extends { deadlineAt: Date }>(matchdays: T[]): T | undefined {
  return matchdays.find((m) => isTippable(m.deadlineAt));
}

/**
 * Wettbewerbe der aktuellen Saison (sortiert) inkl. Spieltage + Partieanzahl.
 * Partieanzahl = Summe über alle Sections des Spieltags.
 */
export async function getCompetitions() {
  const season = await getCurrentSeason();
  if (!season) {
    return [];
  }
  return prisma.competition.findMany({
    where: { seasonId: season.id },
    orderBy: { sortOrder: 'asc' },
    include: {
      season: { select: { name: true } },
      matchdays: {
        orderBy: { number: 'asc' },
        select: {
          number: true,
          deadlineAt: true,
          _count: { select: { sections: true } },
        },
      },
    },
  });
}

/** Spieltag nach Wettbewerbs-Key + Tipptag-Nummer (in der aktuellen Saison). */
export async function getMatchdayByNumber(competitionKey: CompetitionKey, number: number) {
  return prisma.matchday.findFirst({
    where: { competition: { key: competitionKey }, number },
    include: {
      competition: true,
      ...matchdaySectionsInclude,
    },
  });
}

/** Alle Spieltage (Admin-Übersicht), mit Wettbewerb + Section-Anzahl. */
export async function getMatchdays() {
  return prisma.matchday.findMany({
    orderBy: [{ competition: { sortOrder: 'asc' } }, { number: 'asc' }],
    include: {
      competition: { include: { season: true } },
      _count: { select: { sections: true } },
    },
  });
}

/**
 * Deadline-Logik (SSOT): Tipps sind nur bis zur Deadline möglich.
 * Wird server-seitig im Service erzwungen, UI zeigt nur den Zustand.
 */
export function isTippable(deadlineAt: Date): boolean {
  return new Date() < deadlineAt;
}