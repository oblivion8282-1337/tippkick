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
 * Pro Tipper ein 6-Spalten-Block — wie die Spalten im Block liegen, bestimmt
 * das TipperBlockLayout (klassisch für DFB/EM/WM, kompakt für die CL).
 *
 * Hinweis: Für die BL/L2-Auswertung gibt es in #6 einen vorlagenbasierten Export
 * (inkl. der 1386 Formeln der Originalvorlage). Diese Variante deckt Wettbewerbe
 * ab, für die es keine passende Vorlage gibt (CL/DFB/EM/WM), und bildet im
 * Bundesliga-Sonderfall (TT 1 / TT 16) pro Sektion ein eigenes Sheet.
 */

const HEADER_ROW = 5;

/**
 * Geometrie eines Tipper-Blocks. 'classic' hält das M-Raster aus types.ts
 * (Vertrag mit dem Alt-Saison-Import); das CL-Layout weicht bewusst ab —
 * CL-Dateien werden nie importiert, die Abweichung bleibt auf CL beschränkt.
 */
export type TipperBlockLayout = {
  /** Spalte des ersten Tipper-Blocks (1-basiert). */
  firstTipperCol: number;
  /** Breite der Abstandsspalten zwischen Gast (D) und erstem Block; 0 = Default. */
  gapWidth: number;
  /** Offsets relativ zum Blockstart. */
  nameOffset: number;
  tipHomeOffset: number;
  tipSepOffset: number;
  tipAwayOffset: number;
  headerTipOffset: number;
  headerSepOffset: number;
  /** [Offset, Spaltenbreite]-Paare für die Spalten des Blocks. */
  widths: readonly (readonly [number, number])[];
};

/** Klassisches Layout (DFB/EM/WM): Name über dem „:", Tipps bei +0/+2, erster Block M. */
const CLASSIC_LAYOUT: TipperBlockLayout = {
  firstTipperCol: FIRST_TIPPER_COL,
  gapWidth: 0,
  nameOffset: 1,
  tipHomeOffset: 0,
  tipSepOffset: 1,
  tipAwayOffset: 2,
  headerTipOffset: 0,
  headerSepOffset: 1,
  widths: [
    [0, 5],
    [2, 5],
  ],
};

/**
 * Kompaktes CL-Layout (Wunsch 10/2026, von Hand am TT-2-Export vorgemacht):
 * eigene breite Namensspalte am Blockstart, Tipp Heim : Gast direkt daneben,
 * erster Block in G — nur zwei schmale Abstandsspalten nach der Gast-Spalte.
 */
export const CL_COMPACT_LAYOUT: TipperBlockLayout = {
  firstTipperCol: 7, // G
  gapWidth: 2.42,
  nameOffset: 0,
  tipHomeOffset: 1,
  tipSepOffset: 2,
  tipAwayOffset: 3,
  headerTipOffset: 0,
  headerSepOffset: 2,
  widths: [
    [0, 10.28],
    [1, 4.57],
    [2, 2.42],
    [3, 3.28],
  ],
};

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
  layout?: TipperBlockLayout;
}): Promise<void> {
  const { workbook, sheetName, title, dateRange, tippers, fixtures, tipsByUser } = args;
  const layout = args.layout ?? CLASSIC_LAYOUT;
  const blockStart = (i: number) => layout.firstTipperCol + i * TIPPER_BLOCK_WIDTH;
  const ws = workbook.addWorksheet(sheetName);

  ws.getColumn(COL_HOME).width = 24;
  ws.getColumn(COL_AWAY).width = 24;
  if (layout.gapWidth > 0) {
    for (let col = COL_AWAY + 1; col < layout.firstTipperCol; col++) {
      ws.getColumn(col).width = layout.gapWidth;
    }
  }
  for (let i = 0; i < tippers.length; i++) {
    for (const [offset, width] of layout.widths) {
      ws.getColumn(blockStart(i) + offset).width = width;
    }
  }

  ws.getCell(1, COL_HOME).value = title;
  ws.getCell(3, COL_HOME).value = dateRange;
  for (let i = 0; i < tippers.length; i++) {
    ws.getCell(TIPPER_NAME_ROW, blockStart(i) + layout.nameOffset).value = tippers[i].name;
  }

  // Kopfzeile (Header-Row 5).
  // Zeile 3 wurde schon mit Tipper-Namen + Datum gefüllt.
  // Zeile 5: Spalten-Untertitel "Heim : Gast" + "Tipp" pro Block.
  ws.getCell(HEADER_ROW, COL_HOME).value = 'Heim';
  ws.getCell(HEADER_ROW, COL_HOME + 1).value = ':';
  ws.getCell(HEADER_ROW, COL_AWAY).value = 'Gast';
  for (let i = 0; i < tippers.length; i++) {
    const start = blockStart(i);
    // "Tipp"-Label bzw. ":" als visueller Trenner laut Layout-Offsets
    ws.getCell(HEADER_ROW, start + layout.headerTipOffset).value = 'Tipp';
    ws.getCell(HEADER_ROW, start + layout.headerSepOffset).value = ':';
  }

  // Partie-Zeilen
  let row = HEADER_ROW + 1;
  for (const fixture of fixtures) {
    ws.getCell(row, COL_HOME).value = fixture.homeTeam;
    ws.getCell(row, COL_HOME + 1).value = ':';
    ws.getCell(row, COL_AWAY).value = fixture.awayTeam;

    for (let i = 0; i < tippers.length; i++) {
      const tipper = tippers[i];
      const start = blockStart(i);
      const tip = tipsByUser.get(tipper.id)?.get(fixture.id);
      if (tip) {
        ws.getCell(row, start + layout.tipHomeOffset).value = tip.homeGoals;
        ws.getCell(row, start + layout.tipSepOffset).value = ':';
        ws.getCell(row, start + layout.tipAwayOffset).value = tip.awayGoals;
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
  layout?: TipperBlockLayout;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await addTipperSheetToWorkbook({ workbook, sheetName: 'Tipps', ...params });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
