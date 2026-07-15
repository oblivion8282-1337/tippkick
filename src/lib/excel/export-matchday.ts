import ExcelJS from 'exceljs';

/**
 * Generischer Excel-Export für einen Spieltag (eine Sektion, ein Wettbewerb).
 * Pro Tipper ein 6-Spalten-Block (Tipp Heim : Gast + leere Pkt.-Spalten).
 *
 * Hinweis: Für die BL/L2-Auswertung gibt es in #6 einen vorlagenbasierten Export
 * (inkl. der 1386 Formeln der Originalvorlage). Diese Variante deckt Wettbewerbe
 * ab, für die es keine passende Vorlage gibt (CL/DFB/EM/WM).
 */

const COL_HOME = 2; // B
const COL_AWAY = 4; // D
const FIRST_TIPPER_COL = 13; // M
const TIPPER_BLOCK_WIDTH = 6;

export type ExportTipper = { id: string; name: string };
export type ExportFixture = { id: string; homeTeam: string; awayTeam: string };
type TipMap = Map<string, { homeGoals: number; awayGoals: number }>; // fixtureId -> tip

export async function buildMatchdayExcel(params: {
  title: string; // z. B. "BL 34. Spieltag"
  dateRange: string;
  tippers: ExportTipper[];
  fixtures: ExportFixture[];
  tipsByUser: Map<string, TipMap>; // userId -> fixtureId -> tip
}): Promise<Buffer> {
  const { title, dateRange, tippers, fixtures, tipsByUser } = params;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Tipps');

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
    ws.getCell(3, FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH + 1).value = tippers[i].name;
  }

  // Kopfzeile
  const headerRow = 5;
  ws.getCell(headerRow, COL_HOME).value = 'Heim';
  ws.getCell(headerRow, COL_AWAY).value = 'Gast';
  for (let i = 0; i < tippers.length; i++) {
    const start = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH;
    ws.getCell(headerRow, start).value = 'Tipp';
  }

  // Partie-Zeilen
  let row = headerRow + 1;
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

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
