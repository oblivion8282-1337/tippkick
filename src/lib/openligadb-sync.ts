import { prisma } from '@/lib/prisma';
import { importSeasonFromOpenLigaDb } from '@/lib/admin';
import { syncResults } from '@/lib/result-sync';

export type OpenLigaDbSyncSummary = {
  competitions: number;
  sections: number;
  fixtures: number;
  resultsUpdated: number;
  resultsSkipped: number;
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
  for (const competition of competitions) {
    const result = await importSeasonFromOpenLigaDb(competition.id);
    if (result.ok) {
      sections += result.sections;
      fixtures += result.fixtures;
    }
  }

  const sync = await syncResults();
  return {
    competitions: competitions.length,
    sections,
    fixtures,
    resultsUpdated: sync.updated,
    resultsSkipped: sync.skipped,
  };
}
