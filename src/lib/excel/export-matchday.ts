import ExcelJS from 'exceljs';

import type { League } from '@/generated/prisma/client';
import { LEAGUE_LABELS, LEAGUE_ORDER } from '@/lib/constants';

/**
 * Baut die Auswertungs-Excel für einen Spieltag im Layout des `34.TT`-Blatts
 * aus Vorlagen/34_TT_Auswertung.xlsx:
 *
 *   Master-Spalten: B=Heim, C=':', D=Gast, E=Ergeb., I/J/K=3er/2er/1er (leer)
 *   Pro Tipper ein 6-Spalten-Block ab Spalte M (13), im Abstand von 6:
 *     [Tipp-Heim, ':', Tipp-Gast, 'Pkt.', leer, leer]  -> Ergebnis-/Punkte leer
 *
 * Tipps werden eingetragen; Ergebnis- und Punkte-Spalten bleiben für die
 * Tippleitung frei.
 */

const COL_HOME = 2; // B
const COL_AWAY = 4; // D
const FIRST_TIPPER_COL = 13; // M
const TIPPER_BLOCK_WIDTH = 6;

export type ExportTipper = { id: string; name: string };
export type ExportFixture = {
  id: string;
  league: League;
  homeTeam: string;
  awayTeam: string;
};
type TipMap = Map<string, { homeGoals: number; awayGoals: number }>; // fixtureId -> tip

export async function buildMatchdayExcel(params: {
  matchdayNumber: number;
  dateRange: string;
  tippers: ExportTipper[];
  fixtures: ExportFixture[];
  tipsByUser: Map<string, TipMap>; // userId -> fixtureId -> tip
}): Promise<Buffer> {
  const { matchdayNumber, dateRange, tippers, fixtures, tipsByUser } = params;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`${matchdayNumber}.TT`);

  // Spaltenbreiten (Master + Tipper-Blöcke)
  ws.getColumn(COL_HOME).width = 24;
  ws.getColumn(COL_AWAY).width = 24;
  for (let i = 0; i < tippers.length; i++) {
    const start = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH;
    ws.getColumn(start).width = 5; // Tipp-Heim
    ws.getColumn(start + 2).width = 5; // Tipp-Gast
  }

  // Zeile 1: Titel
  ws.getCell(1, COL_HOME).value = `${matchdayNumber}.TT`;
  // Zeile 3: Datum + Tipper-Namen (im Block bei start+1)
  ws.getCell(3, COL_HOME).value = dateRange;
  for (let i = 0; i < tippers.length; i++) {
    const nameCol = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH + 1;
    ws.getCell(3, nameCol).value = tippers[i].name;
  }

  let row = 5;
  for (const league of LEAGUE_ORDER) {
    const leagueFixtures = fixtures.filter((f) => f.league === league);
    if (leagueFixtures.length === 0) {
      continue;
    }

    // Kopfzeile des Liga-Abschnitts
    ws.getCell(row, COL_HOME).value = LEAGUE_LABELS[league];
    ws.getCell(row, 4).value = `${matchdayNumber}. Spieltag`;
    ws.getCell(row, 5).value = 'Ergeb.';
    ws.getCell(row, 9).value = '3er';
    ws.getCell(row, 10).value = '2er';
    ws.getCell(row, 11).value = '1er';
    for (let i = 0; i < tippers.length; i++) {
      const start = FIRST_TIPPER_COL + i * TIPPER_BLOCK_WIDTH;
      ws.getCell(row, start).value = 'Tipp';
      ws.getCell(row, start + 3).value = 'Pkt.';
    }
    row += 1;

    // Partie-Zeilen
    for (const fixture of leagueFixtures) {
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
    row += 1; // Leerzeile zwischen Ligen
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
