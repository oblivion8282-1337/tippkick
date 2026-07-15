import { prisma } from '@/lib/prisma';
import { fetchMatchday, fetchSeason, seasonToYear, type ImportedFixture } from '@/lib/openligadb';
import { getCurrentSeason, matchdaySectionsInclude } from '@/lib/matchdays';
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
async function fetchTaggedSeason(
  shortcuts: string[],
  year: number,
): Promise<Map<number, TaggedFixture[]>> {
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
  return fixtures.reduce(
    (min, f) => (f.kickoff < min ? f.kickoff : min),
    fixtures[0].kickoff,
  );
}

function latestKickoff(fixtures: TaggedFixture[]): Date {
  return fixtures.reduce(
    (max, f) => (f.kickoff > max ? f.kickoff : max),
    fixtures[0].kickoff,
  );
}

/**
 * Setzt genau einen Spieltag im zugehörigen Wettbewerb aktiv (andere im selben
 * Wettbewerb werden inaktiv) – SSOT für "aktueller Spieltag je Wettbewerb".
 */
export async function activateMatchday(matchdayId: string): Promise<void> {
  const matchday = await prisma.matchday.findUnique({
    where: { id: matchdayId },
    select: { competitionId: true },
  });
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

/** Legt eine Liga-Sektion innerhalb einer Tipprunde an. Idempotent über (matchday, league, number). */
export async function upsertSection(input: {
  matchdayId: string;
  league: League | null;
  number: number;
}): Promise<{ id: string; created: boolean }> {
  // findUnique mit nullable composite key wird von Prisma 7 nicht typtauglich
  // unterstützt; findFirst mit gleichem Filter funktioniert und ist genauso
  // exakt (Section ist über @@unique([matchdayId, league, number]) eindeutig).
  const existing = await prisma.matchdaySection.findFirst({
    where: {
      matchdayId: input.matchdayId,
      league: input.league,
      number: input.number,
    },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, created: false };
  }
  const section = await prisma.matchdaySection.create({
    data: {
      matchdayId: input.matchdayId,
      league: input.league,
      number: input.number,
    },
  });
  return { id: section.id, created: true };
}

/** Legt eine Tipprunde (Matchday) ohne Sektionen/Partien an. */
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

/**
 * Legt eine Partie in einer Tipprunde an. Erstellt intern die passende Section
 * (idempotent über (matchday, league, number)): für Single-Liga-Competition
 * eine Section (league=null, number=matchday.number); für Bundesliga eine
 * Section (league=league, number=matchday.number).
 */
export async function addFixture(input: {
  matchdayId: string;
  league: League | null;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
}): Promise<void> {
  const matchday = await prisma.matchday.findUnique({
    where: { id: input.matchdayId },
    select: { number: true },
  });
  if (!matchday) {
    throw new Error('Matchday nicht gefunden');
  }
  const section = await upsertSection({
    matchdayId: input.matchdayId,
    league: input.league,
    number: matchday.number,
  });
  const sortOrder = await prisma.fixture.count({ where: { sectionId: section.id } });
  await prisma.fixture.create({
    data: {
      sectionId: section.id,
      league: input.league,
      kickoff: input.kickoff,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      sortOrder,
    },
  });
}

export async function deleteFixture(fixtureId: string): Promise<void> {
  await prisma.fixture.delete({ where: { id: fixtureId } });
}

/** Matchday inkl. Sektionen + Partien + Tipper-Anzahl. */
export async function getMatchdayAdmin(matchdayId: string) {
  return prisma.matchday.findUnique({
    where: { id: matchdayId },
    include: {
      competition: { include: { season: true } },
      ...matchdaySectionsInclude,
      _count: { select: { sections: true } },
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
 * (falls noch nicht vorhanden) + die Liga-Sektion(en) an und fügt die Partien
 * ein. Bestehende Partien werden nicht überschrieben (Idempotenz).
 *
 * Für Bundesliga: holt pro Liga (BL, L2) die OpenLigaDB-Group; jeder Group wird
 * eine eigene Sektion (league, number). Für Single-Liga-Wettbewerbe (CL/DFB):
 * eine Sektion mit league=null.
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

  const earliest = earliestKickoff(fixtures);
  const latest = latestKickoff(fixtures);
  const deadlineAt = new Date(earliest.getTime() - DEADLINE_OFFSET_MS);

  const matchday = await prisma.matchday.upsert({
    where: { competitionId_number: { competitionId, number: matchdayNumber } },
    update: {},
    create: {
      competitionId,
      number: matchdayNumber,
      startDate: earliest,
      endDate: latest,
      deadlineAt,
      isActive: false,
    },
  });

  // Eine Sektion pro Liga-Group (pro Liga eine eigene Section.number=matchdayNumber).
  const byLeague = groupBy(fixtures, (f) => f.league);
  let totalInserted = 0;
  for (const [league, leagueFixtures] of byLeague) {
    totalInserted += await populateSectionFixtures({
      matchdayId: matchday.id,
      league,
      number: matchdayNumber,
      fixtures: leagueFixtures,
    });
  }

  return { ok: true, matchdayId: matchday.id, count: totalInserted };
}

export type SeasonImportResult =
  | { ok: true; matchdays: number; fixtures: number }
  | { ok: false; reason: 'no-source' | 'empty' | 'error'; message?: string };

/**
 * Importiert eine komplette Saison aus OpenLigaDB. Pro Liga-Group (BL/L2 bzw.
 * Single-Liga) wird eine eigene MatchdaySection angelegt; alle Sections einer
 * groupOrderId landen unter demselben Matchday (Bundesliga: BL-Section N +
 * L2-Section N im gleichen Matchday mit number=N).
 *
 * Idempotent: bestehende Sektionen/Partien werden nicht überschrieben.
 */
export async function importSeasonFromOpenLigaDb(
  competitionId: string,
): Promise<SeasonImportResult> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { season: true },
  });
  if (!competition || competition.sourceShortcuts.length === 0 || !competition.season) {
    return { ok: false, reason: 'no-source' };
  }

  const seasonMap = await fetchTaggedSeason(
    competition.sourceShortcuts,
    seasonToYear(competition.season.name),
  );
  if (seasonMap.size === 0) {
    return { ok: false, reason: 'empty' };
  }

  let matchdays = 0;
  let fixtures = 0;
  for (const [number, dayFixtures] of [...seasonMap.entries()].sort((a, b) => a[0] - b[0])) {
    const earliest = earliestKickoff(dayFixtures);
    const latest = latestKickoff(dayFixtures);
    const matchday = await prisma.matchday.upsert({
      where: { competitionId_number: { competitionId, number } },
      update: {},
      create: {
        competitionId,
        number,
        startDate: earliest,
        endDate: latest,
        deadlineAt: new Date(earliest.getTime() - DEADLINE_OFFSET_MS),
        isActive: false,
      },
    });

    const byLeague = groupBy(dayFixtures, (f) => f.league);
    for (const [league, leagueFixtures] of byLeague) {
      fixtures += await populateSectionFixtures({
        matchdayId: matchday.id,
        league,
        number,
        fixtures: leagueFixtures,
      });
    }
    matchdays += 1;
  }

  return { ok: true, matchdays, fixtures };
}

/** Gruppiert nach Schlüssel; null-Liga landet unter dem Schlüssel `null` (für Single-Liga). */
function groupBy<T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = out.get(key);
    if (arr) {
      arr.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}

/**
 * Legt eine Sektion + ihre Partien idempotent an. Gibt die Anzahl der neu
 * angelegten Partien zurück (0, wenn die Sektion schon befüllt war).
 */
async function populateSectionFixtures(input: {
  matchdayId: string;
  league: League | null;
  number: number;
  fixtures: TaggedFixture[];
}): Promise<number> {
  const section = await upsertSection({
    matchdayId: input.matchdayId,
    league: input.league,
    number: input.number,
  });
  const existing = await prisma.fixture.count({ where: { sectionId: section.id } });
  if (existing > 0) {
    return 0;
  }
  await prisma.fixture.createMany({
    data: input.fixtures.map((f, sortOrder) => ({
      sectionId: section.id,
      league: f.league,
      kickoff: f.kickoff,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      sortOrder,
    })),
  });
  return input.fixtures.length;
}