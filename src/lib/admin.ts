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
  roundName?: string | null;
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
        ...(input.roundName ? { roundName: input.roundName } : {}),
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
            ...(input.roundName ? { roundName: input.roundName } : {}),
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
      // Tipps der Spieltage dieser Tipptage mitlöschen: Sections wandern per
      // SetNull zurück in den Pool — blieben die Tipps stehen, würden sie bei
      // einer späteren Neu-Zuordnung (evtl. nach alter Deadline) wieder auftauchen.
      await tx.tip.deleteMany({
        where: { fixture: { section: { matchday: { competitionId, number: { gt: target } } } } },
      });
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
  if (!fixture) {
    return;
  }
  // Tip-Count mitloggen (Cascade löscht sie mit) für Audit-Transparenz.
  const tipCount = await prisma.tip.count({ where: { fixtureId } });
  if (tipCount > 0) {
    console.warn(`[deleteFixture] ${fixtureId} hat ${tipCount} Tipps – werden mit kaskadiert`);
  }
  await prisma.fixture.delete({ where: { id: fixtureId } });
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

/** Zähler des Reconciliation-Passes (siehe reconcileSectionFixtures). */
export type ReconcileSummary = { moved: number; removed: number; lostTips: number; keptStale: number };

export type SeasonImportResult =
  | { ok: true; sections: number; fixtures: number; reconcile: ReconcileSummary }
  | { ok: false; reason: 'no-source' | 'empty' | 'error'; message?: string };

/**
 * Importiert eine komplette Saison aus OpenLigaDB als **unzugeordnete** Sektionen.
 * Pro Liga-Group (BL/L2 bzw. Single-Liga) eine eigene Sektion mit number=groupOrderId.
 * Partien inkl. externalId + Ergebnisdaten. Idempotent.
 *
 * Vor dem Einfüge-Lauf läuft die Reconciliation (reconcileSectionFixtures): OpenLigaDB
 * ersetzt provisorische Ansetzungen gelegentlich durch neue Match-IDs (z. B. wenn die
 * DFL den echten Spielplan mit Anstoßzeiten veröffentlicht) — ohne Gegenprobe blieben
 * die alten Platzhalter-Partien liegen und würden mit den echten doppelt.
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

  const reconcile = await reconcileSectionFixtures(competitionId, seasonMap);

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

  return { ok: true, sections, fixtures, reconcile };
}

/** Sektions-Identität als Map-Key: Liga (null-fähig) + OpenLigaDB-Gruppe. */
function sectionMapKey(league: League | null, number: number): string {
  return `${league ?? '*'}#${number}`;
}

/**
 * Gegenprobe DB ↔ OpenLigaDB vor dem Import: erkennt Partien, deren externalId in der
 * API nicht mehr (oder nicht mehr an dieser Stelle) existiert, und räumt sie weg —
 * damit ersetzt der Sync ersatzlos neu veröffentlichte Spielpläne, statt Platzhalter
 * ewig liegen zu lassen und mit den echten Partien zu duplizieren.
 *
 * Pro Partie mit externalId, je nach API-Lage:
 *  - **ID in anderer Gruppe/Liga** (Nachverlegung): Partie umziehen — Tipps bleiben
 *    erhalten. Ziel-Sektion nicht in der DB? Dann wie fehlende ID behandeln (löschen,
 *    der Import legt sie dort ohnehin neu an).
 *  - **ID nirgends in der API** (ersetzter Spielplan): löschen — aber nur wenn die
 *    Partie noch offen ist (FINISHED/MANUAL bleibt als Historie stehen) UND die API
 *    für die Gruppe mindestens so viele Partien listet, wie die Sektion trägt. Der
 *    zweite Schutz verhindert Fehllöschungen bei temporär lückenhaften API-Antworten
 *    und respektiert die Nachzügler-Philosophie des Imports (verlegte Partien sollen
 *    später wieder dazukommen dürfen). Sonst: behalten + als keptStale melden.
 *
 * Läuft VOR dem populate-Lauf, damit ersetzte Sektionen sauber neu nummeriert werden;
 * die Spannen/Deadlines berührter Sektionen/Tipptage werden hier explizit neu
 * berechnet — der populate-lauf reicht das nur bei kickoff-Changes bestehender IDs
 * weiter, nach einem Komplett-Austausch würde sonst die alte Platzhalter-Deadline
 * stehen bleiben. Löst nichts aus, wenn eine Gruppe in der API fehlt (keine Evidenz).
 */
async function reconcileSectionFixtures(
  competitionId: string,
  seasonMap: Map<number, TaggedFixture[]>,
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { moved: 0, removed: 0, lostTips: 0, keptStale: 0 };
  const sections = await prisma.matchdaySection.findMany({
    where: { competitionId },
    select: {
      id: true,
      league: true,
      number: true,
      matchdayId: true,
      fixtures: {
        where: { externalId: { not: null } },
        select: { id: true, homeTeam: true, awayTeam: true, status: true, resultSource: true, externalId: true },
      },
    },
  });
  if (sections.length === 0) {
    return summary;
  }

  // API-Index: externe IDs je (Liga, Gruppe) + globale Lage je ID.
  const apiIdsBySection = new Map<string, Set<string>>();
  const apiLocation = new Map<string, { league: League | null; number: number }>();
  for (const [number, fixtures] of seasonMap) {
    for (const fixture of fixtures) {
      const key = sectionMapKey(fixture.league, number);
      let ids = apiIdsBySection.get(key);
      if (!ids) {
        ids = new Set();
        apiIdsBySection.set(key, ids);
      }
      ids.add(fixture.externalId);
      apiLocation.set(fixture.externalId, { league: fixture.league, number });
    }
  }

  // Tipps pro Partie (Löschungen kaskadieren sie — für den Report mitzählen).
  const tipCounts = new Map<string, number>(
    (
      await prisma.tip.groupBy({
        by: ['fixtureId'],
        _count: { _all: true },
        where: { fixture: { section: { competitionId } } },
      })
    ).map((row) => [row.fixtureId, row._count._all]),
  );

  // Phase A: Partien umziehen, deren ID die API an anderer Stelle führt (sicherer
  // Befund — die Existenz an der neuen Stelle beweist den Umzug). Senkt zugleich den
  // Sektions-Bestand für die apiCount-Prüfung in Phase B.
  const touchedSectionIds = new Set<string>();
  const targetSortOrder = new Map<string, number>();
  const remainingCount = new Map<string, number>();
  for (const section of sections) {
    remainingCount.set(section.id, section.fixtures.length);
  }

  const moveTo = async (fixtureId: string, target: (typeof sections)[number]) => {
    let maxSort = targetSortOrder.get(target.id);
    if (maxSort === undefined) {
      const agg = await prisma.fixture.aggregate({
        where: { sectionId: target.id },
        _max: { sortOrder: true },
      });
      maxSort = agg._max.sortOrder ?? -1;
      targetSortOrder.set(target.id, maxSort);
    }
    maxSort += 1;
    targetSortOrder.set(target.id, maxSort);
    await prisma.fixture.update({ where: { id: fixtureId }, data: { sectionId: target.id, sortOrder: maxSort } });
    touchedSectionIds.add(target.id);
    summary.moved += 1;
  };

  const removeFixture = async (
    section: (typeof sections)[number],
    fixture: (typeof section.fixtures)[number],
    reason: string,
  ) => {
    remainingCount.set(section.id, (remainingCount.get(section.id) ?? 0) - 1);
    touchedSectionIds.add(section.id);
    const lostTips = tipCounts.get(fixture.id) ?? 0;
    summary.removed += 1;
    summary.lostTips += lostTips;
    console.warn(
      `[reconcile] ${fixture.homeTeam} - ${fixture.awayTeam} (${fixture.externalId}) — ${reason}` +
        (lostTips > 0 ? `, ${lostTips} Tipp(s) kaskadieren mit` : '') +
        '.',
    );
    await prisma.fixture.delete({ where: { id: fixture.id } });
  };

  for (const section of sections) {
    for (const fixture of section.fixtures) {
      const location = apiLocation.get(fixture.externalId as string);
      if (!location) {
        continue;
      }
      const isSamePlace = location.league === section.league && location.number === section.number;
      if (isSamePlace) {
        continue;
      }
      if (fixture.status === 'FINISHED' || fixture.resultSource === 'MANUAL') {
        summary.keptStale += 1;
        console.warn(
          `[reconcile] ${fixture.homeTeam} - ${fixture.awayTeam} (${fixture.externalId}) ist laut API ` +
            `nun Gruppe ${location.number}/${location.league ?? '*'}, bleibt als FINISHED/MANUAL stehen.`,
        );
        continue;
      }
      const target = sections.find((s) => s.league === location.league && s.number === location.number) ?? null;
      if (target) {
        remainingCount.set(section.id, (remainingCount.get(section.id) ?? 0) - 1);
        touchedSectionIds.add(section.id);
        console.info(
          `[reconcile] ${fixture.homeTeam} - ${fixture.awayTeam} (${fixture.externalId}) wandert von ` +
            `Gruppe ${section.number}/${section.league ?? '*'} nach ${location.number}/${location.league ?? '*'}.`,
        );
        await moveTo(fixture.id, target);
      } else {
        // Ziel-Sektion existiert noch nicht in der DB — Partie hier entfernen, der
        // Import legt sie in der neuen Gruppe ohnehin frisch an (sonst Duplikat).
        await removeFixture(
          section,
          fixture,
          `ist laut API nun Gruppe ${location.number}/${location.league ?? '*'} (Ziel-Sektion noch nicht ` +
            'in der DB — der Import legt sie dort neu an)',
        );
      }
    }
  }

  // Phase B: IDs, die die API nicht mehr kennt (ersetzter Spielplan). apiCount-Schutz
  // gegen den Bestand NACH Phase A — eine in Phase A entfernte Nachverlegung zählt
  // nicht mehr mit.
  for (const section of sections) {
    const apiIds = apiIdsBySection.get(sectionMapKey(section.league, section.number));
    if (!apiIds) {
      continue; // Gruppe in der API unbekannt → keine Evidenz, nichts tun.
    }
    const dbCount = remainingCount.get(section.id) ?? 0;
    for (const fixture of section.fixtures) {
      if (apiIds.has(fixture.externalId as string)) {
        continue;
      }
      const location = apiLocation.get(fixture.externalId as string);
      if (location) {
        continue; // Phase A hat den Fall (Umzug) schon behandelt.
      }
      const keeper = fixture.status === 'FINISHED' || fixture.resultSource === 'MANUAL';
      if (keeper || dbCount > apiIds.size) {
        summary.keptStale += 1;
        console.warn(
          `[reconcile] ${fixture.homeTeam} - ${fixture.awayTeam} (${fixture.externalId}) fehlt in der API — ` +
            keeper
              ? 'bleibt als FINISHED/MANUAL stehen.'
              : `wird behalten (Sektion ${section.number}/${section.league ?? '*'} trägt ${dbCount} Partien, ` +
                `die API nur ${apiIds.size} — möglicherweise temporär lückenhafte API).`,
        );
        continue;
      }
      await removeFixture(section, fixture, 'existiert in der API nicht mehr — Platzhalter-Partie wird gelöscht');
    }
  }

  // Spannen/Deadlines der berührten Sektionen + ihrer Tipptage neu berechnen.
  for (const sectionId of touchedSectionIds) {
    await recalcSectionSpan(sectionId);
  }
  const touchedMatchdayIds = new Set(
    sections.filter((s) => touchedSectionIds.has(s.id)).flatMap((s) => (s.matchdayId ? [s.matchdayId] : [])),
  );
  for (const matchdayId of touchedMatchdayIds) {
    await recalcMatchdaySpan(matchdayId);
  }

  return summary;
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
    roundName: input.fixtures[0]?.roundName ?? null,
  });

  // Nur Partien einfügen, deren externalId noch nicht existiert (per-fixture Idempotenz).
  const existing = await prisma.fixture.findMany({
    where: { sectionId: section.id },
    select: { externalId: true, sortOrder: true, kickoff: true },
  });
  const existingExternalIds = new Set(existing.map((f) => f.externalId).filter((id): id is string => id !== null));
  const baseSortOrder = existing.length; // Fortlaufend in der ganzen Sektion, nicht im Subset
  let newFixtures = input.fixtures.filter((f) => !existingExternalIds.has(f.externalId));

  // Doppelabsicherung: eine OpenLigaDB-matchID identifiziert DIESE Partie — sie darf im
  // ganzen Wettbewerb nur einmal existieren. Die Reconciliation zieht umgezogene Partien
  // vorher in die richtige Sektion; hier bleiben nur Sonderfälle (FINISHED/MANUAL an der
  // Alt-Position), die dann nicht zusätzlich als Kopie in der neuen Sektion landen.
  if (newFixtures.length > 0) {
    const elsewhere = await prisma.fixture.findMany({
      where: {
        externalId: { in: newFixtures.map((f) => f.externalId) },
        sectionId: { not: section.id },
        section: { competitionId: input.competitionId },
      },
      select: { externalId: true },
    });
    const elsewhereIds = new Set(elsewhere.map((f) => f.externalId));
    if (elsewhereIds.size > 0) {
      newFixtures = newFixtures.filter((f) => {
        if (!elsewhereIds.has(f.externalId)) {
          return true;
        }
        console.warn(
          `[populateSectionFixtures] ${f.homeTeam} - ${f.awayTeam} (${f.externalId}) existiert bereits in ` +
            'einer anderen Sektion dieses Wettbewerbs — wird nicht doppelt eingefügt.',
        );
        return false;
      });
    }
  }

  // Verlegte Partien: existierende externalIds erhalten kickoff-Updates (OpenLigaDB
  // verschiebt Anstöße). Danach muss die Sektionsspanne (und ggf. die Tipptag-Deadline)
  // neu berechnet werden — geschieht unten direkt nach den Updates via recalcMatchdaySpan.
  const kickoffById = new Map(
    existing.filter((e) => e.externalId !== null).map((e) => [e.externalId as string, e.kickoff]),
  );
  let kickoffChanged = false;
  for (const f of input.fixtures) {
    const current = kickoffById.get(f.externalId);
    const next = f.kickoff;
    if (current && current.getTime() !== next.getTime()) {
      await prisma.fixture.updateMany({
        where: { sectionId: section.id, externalId: f.externalId },
        data: { kickoff: next },
      });
      kickoffChanged = true;
    }
  }
  // Anstoß verschoben → Sektionsspanne UND Tipptag-Deadline (falls nicht manuell)
  // neu berechnen, sonst richtet sich das Tipp-Fenster weiter nach dem alten Termin.
  if (kickoffChanged) {
    const withMatchday = await prisma.matchdaySection.findUnique({
      where: { id: section.id },
      select: { matchdayId: true },
    });
    if (withMatchday?.matchdayId) {
      const { recalcMatchdaySpan } = await import('@/lib/rounds');
      await recalcMatchdaySpan(withMatchday.matchdayId);
    }
  }

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

/**
 * Auto-Zuordnung für „einfache" Wettbewerbe (CL/DFB/EM/WM): dort ist
 * 1 Tipptag = 1 importierter Spieltag/Runde. Jede noch nicht zugeordnete Sektion
 * bekommt ihren Tipptag (gleiche Nummer, Label = Rundenname aus OpenLigaDB),
 * danach werden Spanne/Deadline berechnet. Idempotent — der Cron ruft das nach
 * jedem Import auf, neu veröffentlichte Runden (z.B. CL-Achtelfinale-Auslosung)
 * erscheinen damit automatisch als tippbarer Tipptag.
 */
export async function autoAssignSimpleTipptage(competitionId: string): Promise<number> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { key: true },
  });
  if (!competition || competition.key === 'BL') {
    return 0; // Bundesliga: 2 Sektionen pro Tipptag — bleibt Admin-Entscheidung.
  }
  const sections = await prisma.matchdaySection.findMany({
    where: { competitionId },
    select: { id: true, number: true, roundName: true, matchdayId: true },
  });
  let assigned = 0;
  for (const section of sections) {
    const matchday = await prisma.matchday.upsert({
      where: { competitionId_number: { competitionId, number: section.number } },
      create: {
        competitionId,
        number: section.number,
        startDate: new Date(),
        endDate: new Date(),
        deadlineAt: new Date(),
      },
      update: {},
      select: { id: true },
    });
    if (section.matchdayId !== matchday.id) {
      await prisma.matchdaySection.update({ where: { id: section.id }, data: { matchdayId: matchday.id } });
      assigned++;
    }
    // Rundenname als Label („Achtelfinale") — reine „N. Spieltag"-Namen sind
    // als Label wertlos, da die Tipptag-Nummer dasselbe aussagt.
    const label = roundLabelOf(section.roundName);
    if (label) {
      await prisma.matchday.updateMany({
        where: { id: matchday.id, label: null },
        data: { label },
      });
    }
    await recalcMatchdaySpan(matchday.id);
  }
  return assigned;
}

/** Macht aus einem OpenLigaDB-Gruppennamen ein Tipptag-Label (null = numerisch lassen). */
function roundLabelOf(roundName: string | null): string | null {
  if (!roundName) {
    return null;
  }
  return /^\d+\.?\s*Spieltag$/i.test(roundName.trim()) ? null : roundName.trim();
}
