import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

import { COL_AWAY, COL_HOME, type FixtureRow, type TipMap } from '@/lib/excel/types';

/**
 * Vorlagenbasierter Export für die BL+L2-Auswertung (das Originalformat).
 * Lädt die Master-Vorlage (mit allen 1386 Formeln + TW-Blatt), schreibt nur
 * die Partien und die gematchten Tipps; Ergebnisse (E/G) bleiben frei – die
 * Tippleitung trägt sie ein, Punkte/Rangliste rechnen automatisch.
 *
 * BL-Partien -> Zeilen 6-14, L2-Partien -> Zeilen 18-26 (wie in der Vorlage).
 */

const TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/excel/template/auswertung-template.xlsx');
const BL_FIRST_ROW = 6;
const L2_FIRST_ROW = 18;

export type BLFixture = FixtureRow;
export type BLTipper = { id: string; name: string };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export async function buildBundesligaExcel(params: {
  matchdayNumber: number;
  dateRange: string;
  blFixtures: BLFixture[];
  l2Fixtures: BLFixture[];
  tippers: BLTipper[];
  tipsByUser: Map<string, TipMap>;
}): Promise<Buffer> {
  const { matchdayNumber, dateRange, blFixtures, l2Fixtures, tippers, tipsByUser } = params;

  const templateBuffer = await readFile(TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  // ExcelJS erwartet seinen eigenen Buffer-Typ; Node-Buffer ist zur Laufzeit
  // kompatibel (nur @types-Reibung).
  await workbook.xlsx.load(templateBuffer as never);
  const sheet = workbook.getWorksheet('34.TT');
  if (!sheet) {
    throw new Error('Vorlage: Blatt 34.TT nicht gefunden');
  }
  const ws = sheet; // nicht-optional für Closure-Nutzung

  // Tipper-Spalten aus Zeile 3 auslesen (Name bei blockStart+1) -> name -> blockStart.
  const nameToBlockStart = new Map<string, number>();
  const row3 = ws.getRow(3);
  row3.eachCell((cell, colNumber) => {
    const value = cell.value;
    if (typeof value === 'string' && value.trim() && colNumber > 4) {
      nameToBlockStart.set(normalizeName(value), colNumber - 1);
    }
  });

  // DB-Tipper -> blockStart (per Namens-Match). Ohne Match: ignorieren + melden.
  const tipperColumns: { tipper: BLTipper; blockStart: number }[] = [];
  const unmatched: string[] = [];
  for (const tipper of tippers) {
    const blockStart = nameToBlockStart.get(normalizeName(tipper.name));
    if (blockStart !== undefined) {
      tipperColumns.push({ tipper, blockStart });
    } else {
      unmatched.push(tipper.name);
    }
  }
  if (unmatched.length > 0) {
    console.log(`[export] Tipper ohne Vorlagen-Spalte (übersprungen): ${unmatched.join(', ')}`);
  }

  // Titel + Datum
  ws.getCell(1, COL_HOME).value = `${matchdayNumber}.TT`;
  ws.getCell(3, COL_HOME).value = dateRange;

  function writeSection(firstRow: number, fixtures: BLFixture[]) {
    fixtures.forEach((fixture, i) => {
      const row = firstRow + i;
      ws.getCell(row, COL_HOME).value = fixture.homeTeam;
      ws.getCell(row, COL_HOME + 1).value = ':';
      ws.getCell(row, COL_AWAY).value = fixture.awayTeam;

      for (const { tipper, blockStart } of tipperColumns) {
        const tip = tipsByUser.get(tipper.id)?.get(fixture.id);
        if (tip) {
          ws.getCell(row, blockStart).value = tip.homeGoals;
          ws.getCell(row, blockStart + 1).value = ':';
          ws.getCell(row, blockStart + 2).value = tip.awayGoals;
        }
      }
    });
  }

  writeSection(BL_FIRST_ROW, blFixtures);
  writeSection(L2_FIRST_ROW, l2Fixtures);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
