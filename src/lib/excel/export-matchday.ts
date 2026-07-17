import ExcelJS from 'exceljs';

import {
  COL_AWAY,
  COL_HOME,
  FIRST_TIPPER_COL,
  TIPPER_BLOCK_WIDTH,
  TIPPER_NAME_ROW,
  type FixtureRow,
  type TipMap,
} from '@/lib/excel/types';

/**
 * Generischer Excel-Export für einen Spieltag (eine Sektion, ein Wettbewerb).
 * Pro Tipper ein 6-Spalten-Block (Tipp Heim : Gast + leere Pkt.-Spalten).
 *
 * Hinweis: Für die BL/L2-Auswertung gibt es in #6 einen vorlagenbasierten Export
 * (inkl. der 1386 Formeln der Originalvorlage). Diese Variante deckt Wettbewerbe
 * ab, für die es keine passende Vorlage gibt (CL/DFB/EM/WM), und bildet im
 * Bundesliga-Sonderfall (TT 1 / TT 16) pro Sektion ein eigenes Sheet.
 */

const HEADER_ROW = 5;

export type ExportTipper = { id: string; name: string };
export type ExportFixture = FixtureRow;

/**
 * Schreibt ein Tipps-Sheet in ein bestehendes Workbook. Wird sowohl von
 * buildMatchdayExcel (einzelnes Sheet) als auch vom Bundesliga-Sonderfall
 * (mehrere Sheets, eines pro Liga-Sektion) genutzt.
 */
export async function addTipperSheetToWorkbook(args: {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  title: string;
  dateRange: string;
  tippers: ExportTipper[];
  fixtures: ExportFixture[];
  tipsByUser: Map<string, TipMap>; // userId -> fixtureId -> tip
}): Promise<void> {
  const { workbook, sheetName, title, dateRange, tippers, fixtures, tipsByUser } = args;
  const ws = workbook.addWorksheet(sheetName);

  ws.getColumn(COL_HOME).width = 24;
  ws.getColumn(COL_AWAY).width = 24;
  for (let i = 0; i < tippers.length; i++) {
    const start = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH;
    ws.getColumn(start).width = 5; // Tipp-Heim
    ws.getColumn(start + 2).width = 5; // Tipp-Gast
  }

  ws.getCell(1, COL_HOME).value = title;
  ws.getCell(3, COL_HOME).value = dateRange;
  for (let i = 0; i < tippers.length; i++) {
    ws.getCell(TIPPER_NAME_ROW, FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH + 1).value = tippers[i].name;
  }

  // Kopfzeile (Header-Row 5).
  // Zeile 3 wurde schon mit Tipper-Namen + Datum gefüllt.
  // Zeile 5: Spalten-Untertitel "Heim : Gast" + "Tipp" pro Block.
  ws.getCell(HEADER_ROW, COL_HOME).value = 'Heim';
  ws.getCell(HEADER_ROW, COL_HOME + 1).value = ':';
  ws.getCell(HEADER_ROW, COL_AWAY).value = 'Gast';
  for (let i = 0; i < tippers.length; i++) {
    const start = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH;
    ws.getCell(HEADER_ROW, start).value = 'Tipp';
    // ":" als visueller Trenner zwischen Heim- und Gast-Tipp-Zelle
    ws.getCell(HEADER_ROW, start + 1).value = ':';
  }

  // Partie-Zeilen
  let row = HEADER_ROW + 1;
  for (const fixture of fixtures) {
    ws.getCell(row, COL_HOME).value = fixture.homeTeam;
    ws.getCell(row, COL_HOME + 1).value = ':';
    ws.getCell(row, COL_AWAY).value = fixture.awayTeam;

    for (let i = 0; i < tippers.length; i++) {
      const tipper = tippers[i];
      const start = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH;
      const tip = tipsByUser.get(tipper.id)?.get(fixture.id);
      if (tip) {
        ws.getCell(row, start).value = tip.homeGoals;
        ws.getCell(row, start + 1).value = ':';
        ws.getCell(row, start + 2).value = tip.awayGoals;
      }
    }
    row += 1;
  }
}

export async function buildMatchdayExcel(params: {
  title: string; // z. B. "BL 34. Spieltag"
  dateRange: string;
  tippers: ExportTipper[];
  fixtures: ExportFixture[];
  tipsByUser: Map<string, TipMap>; // userId -> fixtureId -> tip
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await addTipperSheetToWorkbook({ workbook, sheetName: 'Tipps', ...params });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
