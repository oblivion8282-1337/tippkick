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
import { recalcMatchdaySpan } from '@/lib/rounds';
import { COMPETITION_LABELS, LEAGUE_SHORTCUTS, OPENLIGADB_SHORTCUTS } from '@/lib/constants';
import type { League } from '@/generated/prisma/client';

/**
 * Legt eine kanonische Liga-Sektion (Spieltag) an oder liefert die existierende.
 * Identität: (competitionId, league, number). Race-sicher via Serializable-TX + P2002-Catch
 * (Postgres @@unique([competitionId, league, number]) hasht NULL ≠ NULL, deswegen ist der
 * FindUnique-First hier nur Optimierung; der eigentliche Schutz ist der Unique-Constraint +
 * Retry).
 */
export async function upsertSection(input: {
  competitionId: string;
  league: League | null;
  number: number;
  startDate: Date;
  endDate: Date;
  sourceShortcut?: string | null;
}): Promise<{ id: string; created: boolean }> {
  try {
    const section = await prisma.matchdaySection.create({
      data: {
        competitionId: input.competitionId,
        league: input.league,
        number: input.number,
        startDate: input.startDate,
        endDate: input.endDate,
        ...(input.sourceShortcut ? { sourceShortcut: input.sourceShortcut } : {}),
      },
      select: { id: true },
    });
    return { id: section.id, created: true };
  } catch (error) {
    // P2002: parallel runner hat schon angelegt → frisch lesen + Span aktualisieren.
    if (isUniqueConstraintError(error)) {
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
    }
    throw error;
  }
}

/** Prisma wirft PrismaClientKnownRequestError mit Code P2002 auf Unique-Constraint. */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}

/**
 * Berechnet die Datumsspanne einer Sektion aus ihren Partien neu.
 *
 * Hinweis: bei einer leeren Sektion (z. B. nach deleteFixture der letzten Partie)
 * werden die alten Daten stehen gelassen – das Schema verlangt non-nullable Dates,
 * und eine künstliche Sentinel-Datierung würde die Anzeige verfälschen. In dem
 * Edge-Case sollte der Admin die Sektion selbst löschen oder neu importieren.
 */
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

/**
 * Setzt die Tipptage eines Wettbewerbs auf exakt 1..count (idempotent): fehlende
 * Nummern werden angelegt, Tipptage mit Nummer > count gelöscht (deren Spieltage
 * wandern per SetNull zurück in den Pool). „Anlegen" mit 34 bei bestehenden 35
 * entfernt also Nr. 35; erneutes Klicken mit 34 ändert nichts. Platzhalter-Daten;
 * Span/Deadline werden via recalcMatchdaySpan gesetzt, sobald Spieltage zugeordnet.
 */
export async function createTipptageBatch(
  competitionId: string,
  count: number,
): Promise<{ created: number; deleted: number }> {
  const target = Math.max(1, Math.min(100, Math.trunc(count)));
  const existing = await prisma.matchday.findMany({ where: { competitionId }, select: { number: true } });
  const have = new Set(existing.map((m) => m.number));
  const now = new Date();
  const toCreate = Array.from({ length: target }, (_, i) => i + 1)
    .filter((number) => !have.has(number))
    .map((number) => ({ competitionId, number, startDate: now, endDate: now, deadlineAt: now }));

  // Race-Schutz: zwei parallele Aufrufe dürfen nicht beide dieselben Lücken inserten.
  let created = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const data of toCreate) {
        try {
          await tx.matchday.create({ data });
          created++;
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error;
          }
          // parallel runner hat diese Nummer schon angelegt → ok
        }
      }
      await tx.matchday.deleteMany({ where: { competitionId, number: { gt: target } } });
    },
    { isolationLevel: 'Serializable' },
  );

  return { created, deleted: existing.filter((m) => m.number > target).length };
}

/**
 * Legt eine neue Saison an (idempotent) inkl. Bundesliga-Wettbewerb (BL1+BL2 als
 * OpenLigaDB-Quelle). Atomar via TX + P2002-Retry: zwei parallele Aufrufe mit
 * demselben Namen dürfen nicht beide season.create durchlaufen (P2002 auf name @unique).
 */
export async function createSeasonWithBundesliga(name: string): Promise<{ id: string; created: boolean }> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Saison-Name fehlt');
  }

  return prisma.$transaction(async (tx) => {
    let season = await tx.season.findUnique({
      where: { name: trimmed },
      include: { competitions: { select: { key: true } } },
    });
    if (!season) {
      try {
        season = await tx.season.create({
          data: { name: trimmed },
          include: { competitions: { select: { key: true } } },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
        // parallel runner hat die Season gerade angelegt → nachlesen
        season = await tx.season.findUnique({
          where: { name: trimmed },
          include: { competitions: { select: { key: true } } },
        });
        if (!season) {
          throw error;
        }
      }
    }
    if (!season.competitions.some((c) => c.key === 'BL')) {
      try {
        await tx.competition.create({
          data: {
            seasonId: season.id,
            key: 'BL',
            name: COMPETITION_LABELS.BL,
            sortOrder: 0,
            sourceShortcuts: OPENLIGADB_SHORTCUTS.BL,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
        // parallel runner hat die Competition gerade angelegt → ok
      }
    }
    return { id: season.id, created: !season.competitions.some((c) => c.key === 'BL') };
  });
}

/**
 * Legt eine Partie in einer bestehenden Sektion (Spieltag) an. Die Sektion muss
 * existieren (Identität competitionId + league + number). Aktualisiert die
 * Sektionsspanne und – falls die Sektion einem Tipptag zugeordnet ist – auch
 * dessen Span/Deadline (sonst zeigt der Tipptag eine veraltete Deadline an).
 *
 * Race-sicher: count + create laufen in einer SERIALIZABLE-Transaktion; bei
 * Konflikt wirft Postgres einen 40001 – die Action kann gefahrlos erneut
 * ausgeführt werden, dann sieht sie den frischen count.
 */
export async function addFixture(input: {
  competitionId: string;
  league: League | null;
  number: number;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
}): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const section = await tx.matchdaySection.findFirst({
        where: { competitionId: input.competitionId, league: input.league, number: input.number },
        select: { id: true, matchdayId: true },
      });
      if (!section) {
        throw new Error('Spieltag (Sektion) nicht gefunden');
      }
      const sortOrder = await tx.fixture.count({ where: { sectionId: section.id } });
      await tx.fixture.create({
        data: {
          sectionId: section.id,
          league: input.league,
          kickoff: input.kickoff,
          homeTeam: input.homeTeam,
          awayTeam: input.awayTeam,
          sortOrder,
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );

  // recalc außerhalb der Transaktion – soll auch bei Konflikt-Reentry laufen.
  const section = await prisma.matchdaySection.findFirst({
    where: { competitionId: input.competitionId, league: input.league, number: input.number },
    select: { id: true, matchdayId: true },
  });
  if (!section) {
    return;
  }
  await recalcSectionSpan(section.id);
  if (section.matchdayId) {
    await recalcMatchdaySpan(section.matchdayId);
  }
}

export async function deleteFixture(fixtureId: string): Promise<void> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { sectionId: true, section: { select: { matchdayId: true } } },
  });
  // Tip-Count mitloggen (Cascade löscht sie mit) für Audit-Transparenz.
  const tipCount = await prisma.tip.count({ where: { fixtureId } });
  if (tipCount > 0) {
    console.warn(`[deleteFixture] ${fixtureId} hat ${tipCount} Tipps – werden mit kaskadiert`);
  }
  await prisma.fixture.delete({ where: { id: fixtureId } });
  if (!fixture) {
    return;
  }
  await recalcSectionSpan(fixture.sectionId);
  if (fixture.section.matchdayId) {
    await recalcMatchdaySpan(fixture.section.matchdayId);
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

  const seasonMap = await fetchTaggedSeason(competition.sourceShortcuts, seasonToYear(competition.season.name));
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
 * Partien zurück. Idempotenz auf externalId-Ebene (nicht Section-Count-Ebene), damit
 * postponed/rechts angesetzte Nachzügler in eine bereits gefüllte Sektion ergänzt werden.
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

  // Nur Partien einfügen, deren externalId noch nicht existiert (per-fixture Idempotenz).
  const existing = await prisma.fixture.findMany({
    where: { sectionId: section.id },
    select: { externalId: true, sortOrder: true },
  });
  const existingExternalIds = new Set(existing.map((f) => f.externalId).filter((id): id is string => id !== null));
  const baseSortOrder = existing.length; // Fortlaufend in der ganzen Sektion, nicht im Subset
  const newFixtures = input.fixtures.filter((f) => !existingExternalIds.has(f.externalId));
  if (newFixtures.length === 0) {
    return 0;
  }

  // Race-Schutz: zwei parallele populate-Aufrufe sehen identische existingExternalIds
  // (jeweils leer) und würden beide createMany aufrufen → Duplikate.
  try {
    await prisma.fixture.createMany({
      data: newFixtures.map((f, i) => {
        const derived = deriveFixtureFields(f);
        return {
          sectionId: section.id,
          league: f.league,
          kickoff: f.kickoff,
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          sortOrder: baseSortOrder + i, // fortlaufend in der Sektion
          externalId: f.externalId,
          ...derived,
          resultSource: derived.status === 'FINISHED' ? ('SYNC' as const) : ('NONE' as const),
          syncedAt: derived.status === 'FINISHED' ? new Date() : null,
        };
      }),
    });
  } catch (error) {
    // P2002: parallel runner hat einzelne externalIds eingefügt → per-fixture-Retry.
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    for (const f of newFixtures) {
      try {
        const derived = deriveFixtureFields(f);
        await prisma.fixture.create({
          data: {
            sectionId: section.id,
            league: f.league,
            kickoff: f.kickoff,
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            sortOrder: baseSortOrder + newFixtures.indexOf(f),
            externalId: f.externalId,
            ...derived,
            resultSource: derived.status === 'FINISHED' ? ('SYNC' as const) : ('NONE' as const),
            syncedAt: derived.status === 'FINISHED' ? new Date() : null,
          },
        });
      } catch (innerError) {
        if (!isUniqueConstraintError(innerError)) {
          throw innerError;
        }
        // parallel runner hat genau diese externalId zuerst eingefügt → ok
      }
    }
  }
  return newFixtures.length;
}
