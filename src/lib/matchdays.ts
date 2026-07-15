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

/** "Aktiver Spieltag, sonst letzter" – SSOT-Regel, mehrfach genutzt. */
export function pickActiveMatchday<T extends { isActive: boolean }>(matchdays: T[]): T | undefined {
  return matchdays.find((m) => m.isActive) ?? matchdays[matchdays.length - 1];
}

/**
 * Default-Spieltag für Tipper-Ansicht (sortiert nach Nummer aufsteigend):
 * 1. aktiver Spieltag, falls noch tippbar (Deadline in der Zukunft)
 * 2. sonst der früheste noch anstehende Spieltag (Deadline in der Zukunft)
 * 3. sonst der aktive Spieltag (auch wenn abgelaufen)
 * 4. sonst der letzte Spieltag
 * So landet der Tipper auf dem nächsten tippbaren Spieltag, nicht auf altem.
 */
export function pickDefaultMatchday<T extends { isActive: boolean; deadlineAt: Date }>(
  matchdays: T[],
): T | undefined {
  if (matchdays.length === 0) {
    return undefined;
  }
  const active = matchdays.find((m) => m.isActive);
  if (active && isTippable(active.deadlineAt)) {
    return active;
  }
  const upcoming = matchdays.find((m) => isTippable(m.deadlineAt));
  return upcoming ?? active ?? matchdays[matchdays.length - 1];
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
          isActive: true,
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