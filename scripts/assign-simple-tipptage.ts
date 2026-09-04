/**
 * Tipptage für "einfache" Wettbewerbe (CL, DFB, später EM/WM): hier ist
 * 1 Tipptag = 1 importierter Spieltag (CL-Ligaphasentag) bzw. 1 Pokalrunde —
 * anders als bei der Bundesliga (2 Sektionen pro Tipptag).
 *
 * Legt Tipptage 1..count an und ordnet jedem die Sektion mit derselben Nummer
 * zu; danach werden Spanne/Deadline neu berechnet. Idempotent.
 *
 * Aufruf: pnpm exec tsx scripts/assign-simple-tipptage.ts CL 8
 *         pnpm exec tsx scripts/assign-simple-tipptage.ts DFB 6
 */
import 'dotenv/config';

import { prisma } from '../src/lib/prisma';
import { autoAssignSimpleTipptage, createTipptageBatch } from '../src/lib/admin';
import type { CompetitionKey } from '../src/generated/prisma/client';

async function main(): Promise<void> {
  const [keyArg, countArg] = process.argv.slice(2);
  const key = keyArg as CompetitionKey;
  const count = Number.parseInt(countArg ?? '0', 10);
  if (!key || !['CL', 'DFB', 'EM', 'WM'].includes(key) || !Number.isFinite(count) || count < 1) {
    throw new Error('Verwendung: tsx scripts/assign-simple-tipptage.ts <CL|DFB|EM|WM> <Anzahl Tipptage>');
  }

  const competition = await prisma.competition.findFirst({
    where: { key },
    orderBy: { season: { name: 'desc' } },
    select: { id: true, name: true },
  });
  if (!competition) {
    throw new Error(`Wettbewerb ${key} nicht gefunden (erst aktivieren: activate-competitions.ts)`);
  }

  const batch = await createTipptageBatch(competition.id, count);
  console.log(`${key}: Tipptage angelegt=${batch.created}, geloescht=${batch.deleted}`);

  const sections = await prisma.matchdaySection.findMany({
    where: { competitionId: competition.id },
    select: { id: true, number: true },
    orderBy: { number: 'asc' },
  });
  const matchdays = await prisma.matchday.findMany({
    where: { competitionId: competition.id },
    select: { id: true, number: true },
  });

  const assigned = await autoAssignSimpleTipptage(competition.id);
  console.log(`${key}: ${assigned} Spieltage zugeordnet, Spannen/Deadlines aktualisiert.`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
