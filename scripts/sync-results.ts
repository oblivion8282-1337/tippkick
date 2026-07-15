import 'dotenv/config';

import { syncOpenLigaDb } from '../src/lib/openligadb-sync';

/**
 * Löst den vollständigen OpenLigaDB-Abgleich manuell aus (Spieltage importieren +
 * Ergebnisse aktualisieren) — Dev-Ersatz für den Cron-Sidecar. Aufruf: `pnpm sync:results`.
 */
syncOpenLigaDb()
  .then((s) => {
    console.log(
      `Sync fertig: ${s.competitions} Wettbewerbe, ${s.sections} Spieltage, ${s.fixtures} Partien, ` +
        `${s.resultsUpdated} Ergebnisse aktualisiert, ${s.resultsSkipped} übersprungen (MANUAL).`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
