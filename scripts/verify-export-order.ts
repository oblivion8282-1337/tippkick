import 'dotenv/config';

import ExcelJS from 'exceljs';

import { buildAuswertung } from '../src/lib/auswertung';
import { buildAuswertungExcel } from '../src/lib/excel/export-auswertung';
import { getMatchdayByNumber } from '../src/lib/matchdays';
import { prisma } from '../src/lib/prisma';

/**
 * Verifikation der Export-Reihenfolge: baut die Auswertung-Excel für gegebene
 * Tipptage und druckt die Wochentagsspalte des Roh-Blatts. Aufruf:
 * `TZ=Europe/Berlin tsx scripts/verify-export-order.ts 5 6`
 */
async function main() {
  const numbers = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));

  const season = await prisma.season.findFirst({ where: { name: '26/27' } });
  if (!season) {
    throw new Error('Saison 26/27 nicht gefunden');
  }
  const competition = await prisma.competition.findFirst({ where: { seasonId: season.id, key: 'BL' } });
  if (!competition) {
    throw new Error('BL-Wettbewerb nicht gefunden');
  }

  for (const number of numbers) {
    const matchday = await getMatchdayByNumber('BL', number, season.id);
    if (!matchday) {
      console.log(`TT ${number}: nicht gefunden`);
      continue;
    }
    const view = await buildAuswertung(matchday.id);
    if (!view) {
      console.log(`TT ${number}: keine Auswertung`);
      continue;
    }
    const buffer = await buildAuswertungExcel(view);
    const file = `/tmp/export-check-${number}.TT.xlsx`;
    const fs = await import('node:fs');
    fs.writeFileSync(file, new Uint8Array(buffer));

    console.log(`=== TT ${number} (${view.dateRangeLabel}) → ${file}`);
    const workbook = new ExcelJS.Workbook();
    // exceljs.typings erwarten ihren eigenen Buffer-Typ — inhaltlich identisch.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = workbook.getWorksheet(`${number}.TT`);
    for (let row = 6; row <= 30; row++) {
      const weekday = ws?.getCell(row, 1).value;
      const home = ws?.getCell(row, 2).value;
      const away = ws?.getCell(row, 4).value;
      if (typeof home === 'string' && typeof away === 'string') {
        console.log(`  ${String(weekday ?? '').padEnd(8)} ${home} - ${away}`);
      } else if (typeof weekday === 'string') {
        console.log(`  [Sektion] ${weekday}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
