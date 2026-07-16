import { prisma } from '@/lib/prisma';
import { importSeasonFromOpenLigaDb } from '@/lib/admin';
import { syncResults } from '@/lib/result-sync';

export type OpenLigaDbSyncSummary = {
  competitions: number;
  sections: number;
  fixtures: number;
  resultsUpdated: number;
  resultsSkipped: number;
  failures?: { competitionId: string; reason: string; message?: string }[];
};

/**
 * Vollständiger OpenLigaDB-Abgleich (Hintergrund-Job/Cron): importiert idempotent
 * alle Spieltage + Ansetzungen je Wettbewerb mit Quelle (neu veröffentlichte
 * Spieltage kommen automatisch dazu) und aktualisiert danach die Ergebnisse.
 *
 * Das Gruppieren der Spieltage zu Tipptagen bleibt dem Admin überlassen — das ist
 * die Vereins-Entscheidung, die kein Automatismus treffen kann.
 */
export async function syncOpenLigaDb(): Promise<OpenLigaDbSyncSummary> {
  const competitions = await prisma.competition.findMany({
    where: { NOT: { sourceShortcuts: { isEmpty: true } } },
    select: { id: true },
  });

  let sections = 0;
  let fixtures = 0;
  const failures: { competitionId: string; reason: string; message?: string }[] = [];
  for (const competition of competitions) {
    try {
      const result = await importSeasonFromOpenLigaDb(competition.id);
      if (result.ok) {
        sections += result.sections;
        fixtures += result.fixtures;
      } else {
        failures.push({ competitionId: competition.id, reason: result.reason, message: result.message });
        console.warn(
          `[syncOpenLigaDb] Wettbewerb ${competition.id} ohne Import: ${result.reason}` +
            (result.message ? ` (${result.message})` : ''),
        );
      }
    } catch (error) {
      // throws (z. B. fetchJson nach erschöpften Retries, JSON-Parse-Fehler) →
      // einzelne Wettbewerbe isolieren, statt den ganzen Cron zu kippen.
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ competitionId: competition.id, reason: 'error', message });
      console.warn(`[syncOpenLigaDb] Wettbewerb ${competition.id} wirft: ${message}`);
    }
  }
  if (failures.length > 0) {
    console.warn(`[syncOpenLigaDb] ${failures.length} Wettbewerb(e) ohne Import – Cron-Report folgt.`);
  }

  // syncResults selbst hat eine per-Wettbewerbs-Isolation (try/catch in der
  // for-Schleife). Falls es trotzdem wirft, fängt der äußere Wrapper hier auf.
  let sync = { updated: 0, skipped: 0 };
  try {
    sync = await syncResults();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ competitionId: '*sync*', reason: 'error', message });
    console.warn(`[syncOpenLigaDb] syncResults wirft: ${message}`);
  }

  return {
    competitions: competitions.length,
    sections,
    fixtures,
    resultsUpdated: sync.updated,
    resultsSkipped: sync.skipped,
    ...(failures.length > 0 ? { failures } : {}),
  };
}
