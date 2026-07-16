import { prisma } from '@/lib/prisma';
import { fetchTaggedSeason, groupBy } from '@/lib/import-helpers';
import { seasonToYear, type ImportedFixture } from '@/lib/openligadb';
import type { FixtureStatus } from '@/generated/prisma/client';

export type SyncSummary = {
  competitions: number;
  sections: number;
  updated: number;
  skipped: number;
};

/**
 * Leitet Ergebnis-Felder + Status aus einer importierten Partie ab.
 * - FINISHED: OpenLigaDB matchIsFinished (verlässlich)
 * - IN_PROGRESS: heuristisch (Anpfiff vergangen, kein Endergebnis)
 * - SCHEDULED: sonst
 * CANCELLED/POSTPONED lassen sich aus OpenLigaDB nicht verlässlich ablesen → nur manuell.
 */
export function deriveFixtureFields(f: ImportedFixture): {
  homeGoals: number | null;
  awayGoals: number | null;
  htHomeGoals: number | null;
  htAwayGoals: number | null;
  status: FixtureStatus;
} {
  const hasResult = f.homeGoals !== undefined && f.awayGoals !== undefined;
  if (f.finished && hasResult) {
    return {
      homeGoals: f.homeGoals ?? null,
      awayGoals: f.awayGoals ?? null,
      htHomeGoals: f.htHomeGoals ?? null,
      htAwayGoals: f.htAwayGoals ?? null,
      status: 'FINISHED',
    };
  }
  const inProgress = !hasResult && f.kickoff.getTime() < Date.now();
  return {
    homeGoals: hasResult ? (f.homeGoals ?? null) : null,
    awayGoals: hasResult ? (f.awayGoals ?? null) : null,
    htHomeGoals: f.htHomeGoals ?? null,
    htAwayGoals: f.htAwayGoals ?? null,
    status: inProgress ? 'IN_PROGRESS' : 'SCHEDULED',
  };
}

/**
 * Schreibt den Ergebnis-Stand einer importierten Partie in die DB-Zeile. Idempotent:
 * - FINISHED + Ergebnis → SYNC
 * - sonst (SCHEDULED / IN_PROGRESS): Goals bleiben unverändert (kein Downgrade),
 *   Status wird ggf. von FINISHED auf IN_PROGRESS gesetzt (LAUFEND), aber
 *   resultSource=NONE (wir können nicht wissen ob ein ADMIN-Override überschrieben würde)
 */
function toResultWrite(f: ImportedFixture) {
  const derived = deriveFixtureFields(f);
  if (derived.status === 'FINISHED') {
    return {
      homeGoals: derived.homeGoals,
      awayGoals: derived.awayGoals,
      htHomeGoals: derived.htHomeGoals,
      htAwayGoals: derived.htAwayGoals,
      status: 'FINISHED' as FixtureStatus,
      resultSource: 'SYNC' as const,
      syncedAt: new Date(),
    };
  }
  // Keine Ergebnis-Daten: nur Status ggf. upgraden, vorhandene Goals nicht loeschen.
  return {
    status: derived.status,
    resultSource: 'NONE' as const,
    syncedAt: null,
  };
}

function matchKey(homeTeam: string, awayTeam: string, kickoff: Date): string {
  return `${homeTeam}|${awayTeam}|${kickoff.getTime()}`;
}

/**
 * Synchronisiert Ergebnisse aus OpenLigaDB in alle (oder einen) Wettbewerb mit Quelle.
 * Zuverlässige Zuordnung über Fixture.externalId (OpenLigaDB matchID), Fallback per
 * Heim/Gast + Anstoß. Fixtures mit resultSource === MANUAL werden übersprungen
 * (manuell gesetzte Ergebnisse gewinnen). Idempotent – sicher im 15-Minuten-Takt.
 *
 * Effizient: pro Wettbewerb ein fetchTaggedSeason, ein Section-Lookup und alle
 * Fixture-Updates gebündelt in einer Transaktion (kein N+1, keine sequenziellen RTs).
 */
export async function syncResults(competitionId?: string): Promise<SyncSummary> {
  const competitions = await prisma.competition.findMany({
    where: competitionId ? { id: competitionId } : undefined,
    include: { season: true },
  });
  const withSource = competitions.filter((c) => c.sourceShortcuts.length > 0 && c.season);

  let sections = 0;
  let updated = 0;
  let skipped = 0;

  for (const competition of withSource) {
    try {
      const year = seasonToYear(competition.season!.name);
      const taggedByGroup = await fetchTaggedSeason(competition.sourceShortcuts, year);

      // Alle Sections des Wettbewerbs einmal laden, nach (league, number) indizieren.
      const dbSections = await prisma.matchdaySection.findMany({
        where: { competitionId: competition.id },
        select: { id: true, league: true, number: true },
      });
      const sectionByKey = new Map(dbSections.map((s) => [`${s.league ?? ''}|${s.number}`, s.id]));

      // Alle Partien dieser Sections einmal laden, nach externalId indizieren.
      const sectionIds = dbSections.map((s) => s.id);
      const dbFixtures = sectionIds.length
        ? await prisma.fixture.findMany({ where: { sectionId: { in: sectionIds } } })
        : [];
      const fixtureByExt = new Map(dbFixtures.filter((f) => f.externalId).map((f) => [f.externalId!, f]));
      const fixtureByKey = new Map(dbFixtures.map((f) => [matchKey(f.homeTeam, f.awayTeam, f.kickoff), f]));

      // Per-fixture-Update mit eigener TX, damit ein einzelner MANUAL-Race nur die
      // jeweilige Partie verliert (P2025 schlucken) statt den ganzen Batch zurückzurollen.
      for (const [groupOrderId, fixtures] of taggedByGroup) {
        for (const [league, leagueFixtures] of groupBy(fixtures, (f) => f.league)) {
          const sectionId = sectionByKey.get(`${league ?? ''}|${groupOrderId}`);
          if (!sectionId) continue; // Spieltag noch nicht importiert
          sections++;

          for (const imp of leagueFixtures) {
            const fixture =
              fixtureByExt.get(imp.externalId) ?? fixtureByKey.get(matchKey(imp.homeTeam, imp.awayTeam, imp.kickoff));
            if (!fixture) continue;
            // Snapshot-Schutz: im Snapshot schon MANUAL → überspringen.
            if (fixture.resultSource === 'MANUAL') {
              skipped++;
              continue;
            }
            try {
              // Lost-Manual-Schutz: WHERE resultSource != 'MANUAL' (Admin kann
              // zwischen Snapshot und Commit auf MANUAL stellen).
              // updateMany statt update: 0 affected statt P2025 → kein Batch-Rollback.
              const result = await prisma.fixture.updateMany({
                where: { id: fixture.id, resultSource: { not: 'MANUAL' } },
                data: toResultWrite(imp),
              });
              if (result.count === 1) {
                updated++;
              } else {
                skipped++;
              }
            } catch {
              // Einzelner Fehler darf nicht den ganzen Sync stoppen.
              skipped++;
            }
          }
        }
      }
    } catch (error) {
      // Eine fehlgeschlagene competition darf den Rest nicht stoppen.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[syncResults] Wettbewerb ${competition.id} wirft: ${message}`);
      skipped++; // grobe Zählung – exakte Counts brauchen einen anderen Mechanismus
    }
  }

  return { competitions: withSource.length, sections, updated, skipped };
}
