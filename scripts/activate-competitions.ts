/**
 * Schaltet zusätzliche Wettbewerbe (CL, DFB) für die aktuelle Saison frei:
 * legt die Competition-Zeile an (idempotent) und importiert die Ansetzungen
 * aus OpenLigaDB als unzugeordnete Spieltage. Aufruf:
 *   pnpm exec tsx scripts/activate-competitions.ts [Saison-Name]
 * Ohne Argument: die Saison mit dem aktuellen Wettbewerb (BL).
 */
import 'dotenv/config';

import { prisma } from '../src/lib/prisma';
import { importSeasonFromOpenLigaDb } from '../src/lib/admin';
import { COMPETITION_LABELS, OPENLIGADB_SHORTCUTS } from '../src/lib/constants';
import type { CompetitionKey } from '../src/generated/prisma/client';

const WANTED: CompetitionKey[] = ['CL', 'DFB'];
const SORT_ORDER: Record<string, number> = { BL: 0, CL: 1, DFB: 2, EM: 3, WM: 4 };

async function main(): Promise<void> {
  const named = process.argv[2];
  const season = named
    ? await prisma.season.findUnique({ where: { name: named }, include: { competitions: true } })
    : await prisma.season.findFirst({
        where: { competitions: { some: { key: 'BL' } } },
        orderBy: { name: 'desc' },
        include: { competitions: true },
      });
  if (!season) {
    throw new Error('Saison nicht gefunden');
  }
  console.log(`Saison: ${season.name}`);

  for (const key of WANTED) {
    const existing = season.competitions.find((c) => c.key === key);
    const competition =
      existing ??
      (await prisma.competition.create({
        data: {
          seasonId: season.id,
          key,
          name: COMPETITION_LABELS[key],
          sortOrder: SORT_ORDER[key] ?? 0,
          sourceShortcuts: OPENLIGADB_SHORTCUTS[key],
        },
      }));
    // Nachträglich gesetzte Quelle auch bei evtl. vorhandener Zeile ergänzen.
    if (existing && existing.sourceShortcuts.length === 0) {
      await prisma.competition.update({
        where: { id: existing.id },
        data: { sourceShortcuts: OPENLIGADB_SHORTCUTS[key] },
      });
    }
    console.log(`${key}: Competition ${existing ? 'exists' : 'created'} (${competition.id}), starte Import …`);
    const result = await importSeasonFromOpenLigaDb(competition.id);
    console.log(`${key}:`, JSON.stringify(result));
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
