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
 * Saison für Admin-Seiten (Default-Auswahl). Primär die aktuell laufende Saison
 * (die mit der nächsten Tipp-Deadline), sonst die neueste Saison. So wird immer
 * die aktuelle Saison angezeigt, ohne dass der Admin sie jedes Mal auswählen muss.
 */
export async function getManageableSeason() {
  const current = await getCurrentSeason();
  if (current) {
    return current;
  }
  return prisma.season.findFirst({ orderBy: { name: 'desc' } });
}

/** Alle Saisons (absteigend), für den Saison-Wechsler im Admin. */
export async function getSeasons() {
  return prisma.season.findMany({ orderBy: { name: 'desc' } });
}

/**
 * SSOT für den `sections`-Include-Shaped von Matchday. Sortiert nach Liga (BL vor L2
 * bzw. Single-Liga `null` zuerst) + Liga-Spieltags-Nummer; Fixtures chronologisch nach
 * Anstoß, sortOrder nur als Gleichstands-Tiebreaker. Die Anstoß-Sortierung ist das
 * Fundament für Tipp-Maske, Auswertung und Excel-Export: OpenLigaDB verschiebt Anstöße
 * nachträglich, und sortOrder friert die Import-Reihenfolge ein — ohne kickoff-first
 * würde die Reihenfolge (Fr → Sa → So) auseinanderfallen, sobald sich Anstöße ändern.
 * Wird in getMatchdayAdmin / getMatchdayByNumber / getMyTips wiederverwendet.
 */
export const matchdaySectionsInclude = {
  sections: {
    orderBy: [{ league: 'asc' }, { number: 'asc' }],
    include: { fixtures: { orderBy: [{ kickoff: 'asc' }, { sortOrder: 'asc' }] } },
  },
} satisfies Prisma.MatchdayInclude;

/**
 * Default-Spieltag für Tipper-Ansicht: der nächstliegende noch nicht abgelaufene
 * Matchday (sortiert nach deadlineAt aufsteigend, nicht nach Tipptag-Nummer).
 * So landet der Tipper automatisch auf dem Wochenende mit der frühesten Deadline.
 *
 * Fallback: kein offener Tipptag (z.B. DFB zwischen zwei Runden) → der letzte
 * Tipptag MIT Partien, damit der Wettbewerb trotzdem sichtbar/anschaubar bleibt.
 */
export function pickDefaultMatchday<T extends { deadlineAt: Date; _count?: { sections: number } }>(
  matchdays: T[],
): T | undefined {
  const tippable = matchdays
    .filter((m) => isTippable(m.deadlineAt))
    .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime())[0];
  if (tippable) {
    return tippable;
  }
  const withSections = matchdays.filter((m) => (m._count?.sections ?? 0) > 0);
  return withSections[withSections.length - 1];
}

/**
 * Dashboard-Sicht: der LAUFENDE Tipptag (Deadline vorbei, aber noch nicht
 * abgeschlossen — endDate nicht erreicht), damit beim Öffnen des Dashboards das
 * aktuell Gespielte sichtbar ist. Erst wenn er abgeschlossen ist (oder keiner
 * läuft), gilt der Tipp-Fokus (nächster offener, sonst letzter mit Partien).
 * Bewusst anders als pickDefaultMatchday — dort zählt das kommende Tippen.
 */
export function pickCurrentMatchday<T extends { deadlineAt: Date; endDate: Date; _count?: { sections: number } }>(
  matchdays: T[],
): T | undefined {
  const now = Date.now();
  const running = matchdays
    .filter((m) => (m._count?.sections ?? 0) > 0 && m.deadlineAt.getTime() <= now && now <= m.endDate.getTime())
    .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime());
  return running[running.length - 1] ?? pickDefaultMatchday(matchdays);
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
          endDate: true,
          _count: { select: { sections: true } },
        },
      },
    },
  });
}

/**
 * Spieltag nach Wettbewerbs-Key + Tipptag-Nummer.
 *
 * Footgun vermeiden: ohne `seasonId` wuerde findFirst bei zwei parallelen Saisons
 * mit gleichem CompetitionKey + number non-deterministisch zurueckliefern. Caller
 * muessen daher explizit die Saison mitsetzen (id-Rueckgabe von getCurrentSeason).
 */
export async function getMatchdayByNumber(competitionKey: CompetitionKey, number: number, seasonId: string) {
  return prisma.matchday.findFirst({
    where: { competition: { key: competitionKey, seasonId }, number },
    include: {
      competition: true,
      ...matchdaySectionsInclude,
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
