import { prisma } from '@/lib/prisma';
import { fetchMatchday, fetchSeason, seasonToYear, type ImportedFixture } from '@/lib/openligadb';
import { getCurrentSeason } from '@/lib/matchdays';
import { DEADLINE_OFFSET_MS, SHORTCUT_TO_LEAGUE } from '@/lib/constants';
import type { League } from '@/generated/prisma/client';

/** Partie inkl. Sektions-Tag (1./2. Liga bei Bundesliga; sonst null). */
type TaggedFixture = ImportedFixture & { league: League | null };

/** Holt einen Spieltag über alle Quellen eines Wettbewerbs, Partien getaggt. */
async function fetchTaggedMatchday(shortcuts: string[], year: number, groupOrderId: number): Promise<TaggedFixture[]> {
  const out: TaggedFixture[] = [];
  for (const shortcut of shortcuts) {
    const league = SHORTCUT_TO_LEAGUE[shortcut] ?? null;
    const fixtures = await fetchMatchday(shortcut, year, groupOrderId);
    out.push(...fixtures.map((f) => ({ ...f, league })));
  }
  return out;
}

/** Holt eine ganze Saison über alle Quellen, gruppiert + getaggt nach Spieltag. */
async function fetchTaggedSeason(shortcuts: string[], year: number): Promise<Map<number, TaggedFixture[]>> {
  const merged = new Map<number, TaggedFixture[]>();
  for (const shortcut of shortcuts) {
    const league = SHORTCUT_TO_LEAGUE[shortcut] ?? null;
    const seasonMap = await fetchSeason(shortcut, year);
    for (const [group, fixtures] of seasonMap) {
      const arr = merged.get(group) ?? [];
      arr.push(...fixtures.map((f) => ({ ...f, league })));
      merged.set(group, arr);
    }
  }
  return merged;
}

function earliestKickoff(fixtures: TaggedFixture[]): Date {
  return fixtures.reduce((min, f) => (f.kickoff < min ? f.kickoff : min), fixtures[0].kickoff);
}

/**
 * Setzt genau einen Spieltag im zugehörigen Wettbewerb aktiv (andere im selben
 * Wettbewerb werden inaktiv) – SSOT für "aktueller Spieltag je Wettbewerb".
 */
export async function activateMatchday(matchdayId: string): Promise<void> {
  const matchday = await prisma.matchday.findUnique({ where: { id: matchdayId }, select: { competitionId: true } });
  if (!matchday) {
    return;
  }
  await prisma.$transaction([
    prisma.matchday.updateMany({
      where: { competitionId: matchday.competitionId, isActive: true },
      data: { isActive: false },
    }),
    prisma.matchday.update({ where: { id: matchdayId }, data: { isActive: true } }),
  ]);
}

export async function createMatchday(input: {
  competitionId: string;
  number: number;
  startDate: Date;
  endDate: Date;
  deadlineAt: Date;
}): Promise<string> {
  const matchday = await prisma.matchday.create({
    data: {
      competitionId: input.competitionId,
      number: input.number,
      startDate: input.startDate,
      endDate: input.endDate,
      deadlineAt: input.deadlineAt,
    },
  });
  return matchday.id;
}

export async function addFixture(input: {
  matchdayId: string;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
}): Promise<void> {
  const sortOrder = await prisma.fixture.count({ where: { matchdayId: input.matchdayId } });
  await prisma.fixture.create({ data: { ...input, sortOrder } });
}

export async function deleteFixture(fixtureId: string): Promise<void> {
  await prisma.fixture.delete({ where: { id: fixtureId } });
}

export async function getMatchdayAdmin(matchdayId: string) {
  return prisma.matchday.findUnique({
    where: { id: matchdayId },
    include: {
      competition: { include: { season: true } },
      fixtures: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { fixtures: true } },
    },
  });
}

/** Wettbewerbe der aktuellen Saison (Admin-Auswahl). */
export async function getCompetitionsAdmin() {
  const season = await getCurrentSeason();
  if (!season) {
    return [];
  }
  return prisma.competition.findMany({
    where: { seasonId: season.id },
    orderBy: { sortOrder: 'asc' },
  });
}

export type ImportResult =
  | { ok: true; matchdayId: string; count: number }
  | { ok: false; reason: 'no-source' | 'empty' | 'error'; message?: string };

/**
 * Importiert einen Spieltag aus OpenLigaDB in den Wettbewerb. Legt den Spieltag
 * (falls noch nicht vorhanden) an und fügt die Partien ein. Bestehende Partien
 * werden nicht überschrieben (Idempotenz über hasFixtures-Check).
 */
export async function importFixturesFromOpenLigaDb(
  competitionId: string,
  matchdayNumber: number,
): Promise<ImportResult> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { season: true },
  });
  if (!competition || competition.sourceShortcuts.length === 0 || !competition.season) {
    return { ok: false, reason: 'no-source' };
  }

  const fixtures = await fetchTaggedMatchday(
    competition.sourceShortcuts,
    seasonToYear(competition.season.name),
    matchdayNumber,
  );
  if (fixtures.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // Spieltag anlegen (falls nicht vorhanden) + Deadline = 1 Min vor frühestem Anstoß (beider Ligen).
  const earliest = earliestKickoff(fixtures);
  const deadlineAt = new Date(earliest.getTime() - DEADLINE_OFFSET_MS);

  const matchday = await prisma.matchday.upsert({
    where: { competitionId_number: { competitionId, number: matchdayNumber } },
    update: {},
    create: {
      competitionId,
      number: matchdayNumber,
      startDate: earliest,
      endDate: earliest,
      deadlineAt,
      isActive: false,
    },
  });

  const hasFixtures = await prisma.fixture.count({ where: { matchdayId: matchday.id } });
  if (hasFixtures === 0) {
    await prisma.fixture.createMany({
      data: fixtures.map((f, sortOrder) => ({
        matchdayId: matchday.id,
        league: f.league,
        kickoff: f.kickoff,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        sortOrder,
      })),
    });
  }

  return { ok: true, matchdayId: matchday.id, count: fixtures.length };
}

export type SeasonImportResult =
  | { ok: true; matchdays: number; fixtures: number }
  | { ok: false; reason: 'no-source' | 'empty' | 'error'; message?: string };

/**
 * Importiert eine komplette Saison aus OpenLigaDB (ein API-Call, Partien nach
 * Spieltag gruppiert). Legt alle Spieltage + Partien idempotent an. Bestehende
 * Partien eines Spieltags werden nicht überschrieben.
 */
export async function importSeasonFromOpenLigaDb(competitionId: string): Promise<SeasonImportResult> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { season: true },
  });
  if (!competition || competition.sourceShortcuts.length === 0 || !competition.season) {
    return { ok: false, reason: 'no-source' };
  }

  const seasonMap = await fetchTaggedSeason(competition.sourceShortcuts, seasonToYear(competition.season.name));
  if (seasonMap.size === 0) {
    return { ok: false, reason: 'empty' };
  }

  let matchdays = 0;
  let fixtures = 0;
  for (const [number, dayFixtures] of [...seasonMap.entries()].sort((a, b) => a[0] - b[0])) {
    const earliest = earliestKickoff(dayFixtures);
    const matchday = await prisma.matchday.upsert({
      where: { competitionId_number: { competitionId, number } },
      update: {},
      create: {
        competitionId,
        number,
        startDate: earliest,
        endDate: earliest,
        deadlineAt: new Date(earliest.getTime() - DEADLINE_OFFSET_MS),
        isActive: false,
      },
    });
    const hasFixtures = await prisma.fixture.count({ where: { matchdayId: matchday.id } });
    if (hasFixtures === 0) {
      await prisma.fixture.createMany({
        data: dayFixtures.map((f, sortOrder) => ({
          matchdayId: matchday.id,
          league: f.league,
          kickoff: f.kickoff,
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          sortOrder,
        })),
      });
      fixtures += dayFixtures.length;
    }
    matchdays += 1;
  }

  return { ok: true, matchdays, fixtures };
}
