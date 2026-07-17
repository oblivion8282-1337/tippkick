import { prisma } from '@/lib/prisma';
import { DEADLINE_OFFSET_MS } from '@/lib/constants';
import { spanFromKickoffs } from '@/lib/import-helpers';
import type { League, Prisma } from '@/generated/prisma/client';

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
export async function getTipptageOverview(
  seasonId: string,
): Promise<{ id: string; number: number; competitionId: string }[]> {
  return prisma.matchday.findMany({
    where: { competition: { seasonId } },
    orderBy: { number: 'asc' },
    select: { id: true, number: true, competitionId: true },
  });
}

export type TipptagListItem = {
  id: string;
  number: number;
  startDate: Date;
  endDate: Date;
  deadlineAt: Date;
  /** Enthaltene Liga-Spieltage, z. B. „1. Liga 9 + 2. Liga 11". */
  sections: { league: League | null; number: number }[];
  fixtureCount: number;
  finishedCount: number;
  hasStarted: boolean; // Deadline vorbei = Tipptag läuft/ist vorbei
};

/**
 * Alle Tipptage einer Saison mit dem, was die Tipptag-Liste im Admin braucht:
 * Zeitraum, enthaltene Liga-Spieltage, Ergebnis-Fortschritt und ob die Deadline
 * schon durch ist. Gerade die abgeschlossenen Tipptage sind sonst nirgends
 * erreichbar — „Nächste Deadlines" zeigt nur die offenen.
 */
export async function getTipptageWithStats(seasonId: string): Promise<TipptagListItem[]> {
  const matchdays = await prisma.matchday.findMany({
    where: { competition: { seasonId } },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      startDate: true,
      endDate: true,
      deadlineAt: true,
      sections: {
        orderBy: [{ league: 'asc' }, { number: 'asc' }],
        select: {
          league: true,
          number: true,
          fixtures: { select: { status: true } },
        },
      },
    },
  });

  const now = new Date();
  return matchdays.map((md) => {
    const fixtures = md.sections.flatMap((s) => s.fixtures);
    return {
      id: md.id,
      number: md.number,
      startDate: md.startDate,
      endDate: md.endDate,
      deadlineAt: md.deadlineAt,
      sections: md.sections.map((s) => ({ league: s.league, number: s.number })),
      fixtureCount: fixtures.length,
      finishedCount: fixtures.filter((f) => f.status === 'FINISHED').length,
      hasStarted: md.deadlineAt <= now,
    };
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

// ─── Tipptag-Vorschlag (Spieltage → Tipptage) ────────────────────────────────

/**
 * Ein Tipptag umfasst zwei Liga-Spieltage (= 18 Partien). Normalerweise ein
 * Bundesliga- und ein Zweitliga-Spieltag am selben Wochenende; spielt nur eine
 * Liga (Saisonstart, englische Woche), sind es zwei Spieltage derselben Liga.
 */
const SECTIONS_PER_MATCHDAY = 2;

export type GroupingChange = {
  sectionId: string;
  league: League | null;
  number: number;
  fromMatchdayNumber: number | null;
  toMatchdayNumber: number;
};

export type GroupingProposal = {
  changes: GroupingChange[];
  /** Sektionen, die schon richtig liegen. */
  unchangedCount: number;
  /** Müssten umziehen, haben aber schon Tipps — werden nicht angefasst. */
  blocked: GroupingChange[];
  /** Vorgeschlagene Tipptag-Nummern, die es (noch) nicht gibt. */
  missingMatchdayNumbers: number[];
};

/**
 * Leitet die Tipptag-Zuordnung aus der Spielreihenfolge ab: die Liga-Spieltage
 * nach frühestem Anstoß sortieren und je zwei zu einem Tipptag bündeln.
 *
 * Die Regel ist nicht geraten — sie reproduziert die Zuordnung der Saison 25/26
 * in allen 68 Fällen (geprüft gegen die Alt-Auswertungen des Vereins) und deckt
 * sich mit dem Tipptag-Plan für 26/27.
 *
 * Bewusst ein VORSCHLAG, keine Automatik: die Reihenfolge hängt an den Anstößen,
 * und die stehen für die Rückrunde nur als Rahmentermin fest. Die Tippleitung
 * bestätigt und kann jede Zuordnung danach einzeln ändern.
 */
export async function getGroupingProposal(competitionId: string): Promise<GroupingProposal> {
  const [sections, matchdays, tippedSections] = await Promise.all([
    prisma.matchdaySection.findMany({
      where: { competitionId },
      orderBy: [{ startDate: 'asc' }, { league: 'asc' }, { number: 'asc' }],
      select: { id: true, league: true, number: true, matchday: { select: { number: true } } },
    }),
    prisma.matchday.findMany({ where: { competitionId }, select: { number: true } }),
    prisma.matchdaySection.findMany({
      where: { competitionId, fixtures: { some: { tips: { some: {} } } } },
      select: { id: true },
    }),
  ]);

  const existingNumbers = new Set(matchdays.map((m) => m.number));
  const tipped = new Set(tippedSections.map((s) => s.id));

  const changes: GroupingChange[] = [];
  const blocked: GroupingChange[] = [];
  const missing = new Set<number>();
  let unchangedCount = 0;

  sections.forEach((section, index) => {
    const toMatchdayNumber = Math.floor(index / SECTIONS_PER_MATCHDAY) + 1;
    const fromMatchdayNumber = section.matchday?.number ?? null;
    if (fromMatchdayNumber === toMatchdayNumber) {
      unchangedCount++;
      return;
    }
    const change: GroupingChange = {
      sectionId: section.id,
      league: section.league,
      number: section.number,
      fromMatchdayNumber,
      toMatchdayNumber,
    };
    if (!existingNumbers.has(toMatchdayNumber)) {
      missing.add(toMatchdayNumber);
      return;
    }
    // Ein Umzug ändert die Deadline des Spieltags — bei schon abgegebenen Tipps
    // könnte das nachträglich entscheiden, ob sie zählen. Nicht ohne Ansage.
    (tipped.has(section.id) ? blocked : changes).push(change);
  });

  return { changes, unchangedCount, blocked, missingMatchdayNumbers: [...missing].sort((a, b) => a - b) };
}

/**
 * Wendet den Vorschlag an. Rechnet ihn serverseitig neu (der Client schickt nur
 * den Auslöser, nie die Zuordnung) und aktualisiert Span/Deadline aller
 * betroffenen Tipptage — der alte und der neue ändern beide ihre Spanne.
 */
export async function applyGroupingProposal(competitionId: string): Promise<{ moved: number; blocked: number }> {
  const proposal = await getGroupingProposal(competitionId);
  if (proposal.changes.length === 0) {
    return { moved: 0, blocked: proposal.blocked.length };
  }

  const matchdays = await prisma.matchday.findMany({ where: { competitionId }, select: { id: true, number: true } });
  const idByNumber = new Map(matchdays.map((m) => [m.number, m.id]));

  const touched = new Set<number>();
  for (const change of proposal.changes) {
    const targetId = idByNumber.get(change.toMatchdayNumber);
    if (!targetId) {
      continue;
    }
    await prisma.matchdaySection.update({ where: { id: change.sectionId }, data: { matchdayId: targetId } });
    touched.add(change.toMatchdayNumber);
    if (change.fromMatchdayNumber !== null) {
      touched.add(change.fromMatchdayNumber);
    }
  }

  await Promise.all(
    [...touched]
      .map((number) => idByNumber.get(number))
      .filter((id): id is string => Boolean(id))
      .map((id) => recalcMatchdaySpan(id)),
  );
  return { moved: proposal.changes.length, blocked: proposal.blocked.length };
}
