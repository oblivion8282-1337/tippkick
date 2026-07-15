import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

import type { League } from '@/generated/prisma/client';
import { COL_AWAY, COL_HOME, type FixtureRow, type TipMap } from '@/lib/excel/types';
import { addTipperSheetToWorkbook, type ExportTipper } from '@/lib/excel/export-matchday';

/**
 * Vorlagenbasierter Export für die Bundesliga-Auswertung (1.+2. Liga, Originalformat).
 * Lädt die Master-Vorlage (mit allen 1386 Formeln + TW-Blatt), schreibt nur die
 * Partien eines (kombinierten) Spieltags und die gematchten Tipps; Ergebnisse
 * (E/G) bleiben frei – die Tippleitung trägt sie ein, Punkte/Rangliste rechnen.
 *
 * Sonder-TTs (TT 1 mit zwei 2.-Liga-Sektionen, TT 16 mit zwei 1.-Liga-Sektionen):
 * Es entsteht pro Liga-Sektion ein eigenes Worksheet (kein Formel-Roundtrip),
 * Punkte trägt die Tippleitung manuell ein. Standard-TTs (1 BL ≤ 9 + 1 L2 ≤ 9)
 * füllen wie bisher die Original-Vorlage.
 */

const TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/excel/template/auswertung-template.xlsx');
const FIRST_ROW_BY_LEAGUE: Record<League, number> = { BL: 6, L2: 18 };
const SECTION_ROWS = 9; // Standard-Anzahl pro Sektion (Originalvorlage).

export type BLSectionFixture = FixtureRow;
export type BLSection = { league: League; number: number; fixtures: BLSectionFixture[] };
export type BLTipper = ExportTipper;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Standard-TT = genau 1 BL-Section + 1 L2-Section, beide ≤ 9 Partien (passt in Originalvorlage). */
function isStandardLayout(sections: BLSection[]): boolean {
  const bl = sections.filter((s) => s.league === 'BL');
  const l2 = sections.filter((s) => s.league === 'L2');
  return (
    bl.length === 1 &&
    l2.length === 1 &&
    bl[0].fixtures.length <= SECTION_ROWS &&
    l2[0].fixtures.length <= SECTION_ROWS
  );
}

export async function buildBundesligaExcel(params: {
  matchdayNumber: number;
  dateRange: string;
  sections: BLSection[];
  tippers: BLTipper[];
  tipsByUser: Map<string, TipMap>;
}): Promise<Buffer> {
  const { matchdayNumber, dateRange, sections, tippers, tipsByUser } = params;

  if (isStandardLayout(sections)) {
    const workbook = new ExcelJS.Workbook();
    const tipperColumns = await loadTipperColumns(tippers);
    await fillStandardSheet({ workbook, matchdayNumber, dateRange, sections, tipperColumns, tipsByUser });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // Sonderfall: pro Liga-Sektion ein eigenes Sheet.
  const workbook = new ExcelJS.Workbook();
  await fillMultiSheet({ workbook, matchdayNumber, dateRange, sections, tippers, tipsByUser });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Liest die Tipper-Namen aus der Vorlage und mappt sie auf Spalten-Blöcke. */
async function loadTipperColumns(tippers: BLTipper[]): Promise<{ tipper: BLTipper; blockStart: number }[]> {
  const templateBuffer = await readFile(TEMPLATE_PATH);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer as never);
  const sheet = wb.getWorksheet('34.TT');
  if (!sheet) {
    throw new Error('Vorlage: Blatt 34.TT nicht gefunden');
  }

  const nameToBlockStart = new Map<string, number>();
  sheet.getRow(3).eachCell((cell, colNumber) => {
    const value = cell.value;
    if (typeof value === 'string' && value.trim() && colNumber > 4) {
      nameToBlockStart.set(normalizeName(value), colNumber - 1);
    }
  });

  const result: { tipper: BLTipper; blockStart: number }[] = [];
  const unmatched: string[] = [];
  for (const tipper of tippers) {
    const blockStart = nameToBlockStart.get(normalizeName(tipper.name));
    if (blockStart !== undefined) {
      result.push({ tipper, blockStart });
    } else {
      unmatched.push(tipper.name);
    }
  }
  if (unmatched.length > 0) {
    console.log(`[export] Tipper ohne Vorlagen-Spalte (übersprungen): ${unmatched.join(', ')}`);
  }
  return result;
}

/** Standard-Variante: ein Worksheet, Original-Vorlage mit allen Formeln. */
async function fillStandardSheet(args: {
  workbook: ExcelJS.Workbook;
  matchdayNumber: number;
  dateRange: string;
  sections: BLSection[];
  tipperColumns: { tipper: BLTipper; blockStart: number }[];
  tipsByUser: Map<string, TipMap>;
}): Promise<void> {
  const { workbook, matchdayNumber, dateRange, sections, tipperColumns, tipsByUser } = args;
  const templateBuffer = await readFile(TEMPLATE_PATH);
  await workbook.xlsx.load(templateBuffer as never);
  const ws = workbook.getWorksheet('34.TT');
  if (!ws) {
    throw new Error('Vorlage: Blatt 34.TT nicht gefunden');
  }

  ws.getCell(1, COL_HOME).value = `${matchdayNumber}.TT`;
  ws.getCell(3, COL_HOME).value = dateRange;

  for (const section of sections) {
    const league = section.league;
    const firstRow = FIRST_ROW_BY_LEAGUE[league];
    section.fixtures.forEach((fixture, i) => {
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
}

/**
 * Sonder-Variante (TT 1 / TT 16): pro Sektion ein eigenes Worksheet, ohne
 * Vorlagen-Formeln. Header zeigt Liga-Sektion + Liga-Spieltag-Nummer; Partien
 * in einfacher Tabelle mit Tipper-Blöcken rechts. Punkte trägt die Tippleitung
 * manuell ein (siehe TODO: erweiterte Vorlage für zwei Ligen-Sektionen).
 */
async function fillMultiSheet(args: {
  workbook: ExcelJS.Workbook;
  matchdayNumber: number;
  dateRange: string;
  sections: BLSection[];
  tippers: BLTipper[];
  tipsByUser: Map<string, TipMap>;
}): Promise<void> {
  const { workbook, matchdayNumber, dateRange, sections, tippers, tipsByUser } = args;
  const LEAGUE_LABEL: Record<League, string> = { BL: '1. Liga', L2: '2. Liga' };

  for (const section of sections) {
    const leagueLabel = LEAGUE_LABEL[section.league];
    await addTipperSheetToWorkbook({
      workbook,
      sheetName: `${matchdayNumber}.TT_${leagueLabel.replace(/\./g, '')}_${section.number}.ST`,
      title: `${matchdayNumber}.TT · ${leagueLabel} · ${section.number}. Spieltag`,
      dateRange,
      tippers,
      fixtures: section.fixtures,
      tipsByUser,
    });
  }
}