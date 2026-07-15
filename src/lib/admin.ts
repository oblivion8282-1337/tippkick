import { prisma } from '@/lib/prisma';
import {
  earliestKickoff,
  fetchTaggedSeason,
  groupBy,
  latestKickoff,
  spanFromKickoffs,
  type TaggedFixture,
} from '@/lib/import-helpers';
import { seasonToYear } from '@/lib/openligadb';
import { getManageableSeason, matchdaySectionsInclude } from '@/lib/matchdays';
import { deriveFixtureFields } from '@/lib/result-sync';
import { COMPETITION_LABELS, LEAGUE_SHORTCUTS, OPENLIGADB_SHORTCUTS } from '@/lib/constants';
import type { League } from '@/generated/prisma/client';

/**
 * Legt eine kanonische Liga-Sektion (Spieltag) an oder liefert die existierende.
 * Identität: (competitionId, league, number). Idempotent via findFirst-before-create
 * (nullable Composite-Keys sind in Prisma 7 nicht typsicher; league=null bei CL/DFB
 * ist durch NULL-Semantik in PG nur App-seitig eindeutig). Aktualisiert bei jedem
 * Aufruf die Datumsspanne + Quelle (frisch halten).
 */
export async function upsertSection(input: {
  competitionId: string;
  league: League | null;
  number: number;
  startDate: Date;
  endDate: Date;
  sourceShortcut?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.matchdaySection.findFirst({
    where: { competitionId: input.competitionId, league: input.league, number: input.number },
    select: { id: true },
  });
  if (existing) {
    await prisma.matchdaySection.update({
      where: { id: existing.id },
      data: {
        startDate: input.startDate,
        endDate: input.endDate,
        ...(input.sourceShortcut ? { sourceShortcut: input.sourceShortcut } : {}),
      },
    });
    return { id: existing.id, created: false };
  }
  const section = await prisma.matchdaySection.create({
    data: {
      competitionId: input.competitionId,
      league: input.league,
      number: input.number,
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.sourceShortcut ? { sourceShortcut: input.sourceShortcut } : {}),
    },
  });
  return { id: section.id, created: true };
}

/** Berechnet die Datumsspanne einer Sektion aus ihren Partien neu. */
async function recalcSectionSpan(sectionId: string): Promise<void> {
  const fixtures = await prisma.fixture.findMany({
    where: { sectionId },
    select: { kickoff: true },
  });
  const span = spanFromKickoffs(fixtures.map((f) => f.kickoff));
  if (!span) {
    return;
  }
  await prisma.matchdaySection.update({ where: { id: sectionId }, data: span });
}

/** Legt einen Tipptag (Matchday) ohne Sektionen/Partien an. */
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
 * Legt eine neue Saison an (idempotent) inkl. Bundesliga-Wettbewerb (BL1+BL2 als
 * OpenLigaDB-Quelle). Der Cron importiert die Spieltage dann automatisch.
 */
export async function createSeasonWithBundesliga(name: string): Promise<{ id: string; created: boolean }> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Saison-Name fehlt');
  }
  const existing = await prisma.season.findUnique({
    where: { name: trimmed },
    include: { competitions: { select: { key: true } } },
  });
  if (existing) {
    if (!existing.competitions.some((c) => c.key === 'BL')) {
      await prisma.competition.create({
        data: {
          seasonId: existing.id,
          key: 'BL',
          name: COMPETITION_LABELS.BL,
          sortOrder: 0,
          sourceShortcuts: OPENLIGADB_SHORTCUTS.BL,
        },
      });
    }
    return { id: existing.id, created: false };
  }
  const season = await prisma.season.create({ data: { name: trimmed } });
  await prisma.competition.create({
    data: {
      seasonId: season.id,
      key: 'BL',
      name: COMPETITION_LABELS.BL,
      sortOrder: 0,
      sourceShortcuts: OPENLIGADB_SHORTCUTS.BL,
    },
  });
  return { id: season.id, created: true };
}

/**
 * Legt eine Partie in einer bestehenden Sektion (Spieltag) an. Die Sektion muss
 * existieren (Identität competitionId + league + number). Aktualisiert die
 * Sektionsspanne.
 */
export async function addFixture(input: {
  competitionId: string;
  league: League | null;
  number: number;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
}): Promise<void> {
  const section = await prisma.matchdaySection.findFirst({
    where: { competitionId: input.competitionId, league: input.league, number: input.number },
    select: { id: true },
  });
  if (!section) {
    throw new Error('Spieltag (Sektion) nicht gefunden');
  }
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
  await recalcSectionSpan(section.id);
}

export async function deleteFixture(fixtureId: string): Promise<void> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { sectionId: true },
  });
  await prisma.fixture.delete({ where: { id: fixtureId } });
  if (fixture) {
    await recalcSectionSpan(fixture.sectionId);
  }
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

/** Wettbewerbe der admin-managbaren Saison oder – falls seasonId gegeben – der gewählten. */
export async function getCompetitionsAdmin(seasonId?: string) {
  const id = seasonId ?? (await getManageableSeason())?.id;
  if (!id) {
    return [];
  }
  return prisma.competition.findMany({
    where: { seasonId: id },
    orderBy: { sortOrder: 'asc' },
  });
}

export type SeasonImportResult =
  | { ok: true; sections: number; fixtures: number }
  | { ok: false; reason: 'no-source' | 'empty' | 'error'; message?: string };

/**
 * Importiert eine komplette Saison aus OpenLigaDB als **unzugeordnete** Sektionen.
 * Pro Liga-Group (BL/L2 bzw. Single-Liga) eine eigene Sektion mit number=groupOrderId.
 * Partien inkl. externalId + Ergebnisdaten. Idempotent.
 */
export async function importSeasonFromOpenLigaDb(competitionId: string): Promise<SeasonImportResult> {
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

  let sections = 0;
  let fixtures = 0;
  for (const [number, dayFixtures] of [...seasonMap.entries()].sort((a, b) => a[0] - b[0])) {
    const byLeague = groupBy(dayFixtures, (f) => f.league);
    for (const [league, leagueFixtures] of byLeague) {
      const shortcut = leagueFixtureShortcut(competition.sourceShortcuts, league);
      fixtures += await populateSectionFixtures({
        competitionId,
        league,
        number,
        sourceShortcut: shortcut,
        fixtures: leagueFixtures,
      });
      sections++;
    }
  }

  return { ok: true, sections, fixtures };
}

/** Liefert den OpenLigaDB-Shortcut für eine Liga (für sourceShortcut-Feld). */
function leagueFixtureShortcut(shortcuts: string[], league: League | null): string | null {
  if (!league) {
    return shortcuts[0] ?? null;
  }
  const wanted = LEAGUE_SHORTCUTS[league];
  return shortcuts.find((s) => s === wanted) ?? null;
}

/**
 * Legt eine Sektion + ihre Partien idempotent an. Gibt die Anzahl der neu angelegten
 * Partien zurück (0, wenn die Sektion schon befüllt war). Partien inkl. externalId +
 * Ergebnisdaten (falls OpenLigaDB schon welche liefert).
 */
async function populateSectionFixtures(input: {
  competitionId: string;
  league: League | null;
  number: number;
  sourceShortcut: string | null;
  fixtures: TaggedFixture[];
}): Promise<number> {
  const earliest = earliestKickoff(input.fixtures);
  const latest = latestKickoff(input.fixtures);
  const section = await upsertSection({
    competitionId: input.competitionId,
    league: input.league,
    number: input.number,
    startDate: earliest,
    endDate: latest,
    sourceShortcut: input.sourceShortcut,
  });
  const existing = await prisma.fixture.count({ where: { sectionId: section.id } });
  if (existing > 0) {
    return 0;
  }
  await prisma.fixture.createMany({
    data: input.fixtures.map((f, sortOrder) => {
      const derived = deriveFixtureFields(f);
      return {
        sectionId: section.id,
        league: f.league,
        kickoff: f.kickoff,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        sortOrder,
        externalId: f.externalId,
        ...derived,
        resultSource: derived.status === 'FINISHED' ? ('SYNC' as const) : ('NONE' as const),
        syncedAt: derived.status === 'FINISHED' ? new Date() : null,
      };
    }),
  });
  return input.fixtures.length;
}
