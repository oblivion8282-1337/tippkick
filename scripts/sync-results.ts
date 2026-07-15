import 'dotenv/config';

import { syncResults } from '../src/lib/result-sync';

/**
 * Löst den Ergebnis-Abgleich mit OpenLigaDB manuell aus (Dev-Ersatz für den
 * Cron-Sidecar). Aufruf: `pnpm sync:results`.
 */
syncResults()
  .then((summary) => {
    console.log(
      `Sync fertig: ${summary.competitions} Wettbewerbe, ` +
        `${summary.sections} Spieltage, ${summary.updated} aktualisiert, ${summary.skipped} übersprungen (MANUAL).`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
