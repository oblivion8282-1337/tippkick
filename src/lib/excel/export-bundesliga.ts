import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

import type { League } from '@/generated/prisma/client';
import { COL_AWAY, COL_HOME, type FixtureRow, type TipMap } from '@/lib/excel/types';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
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
/** Header-Zeile (eine über der ersten Sektionszeile). Dort steht "X. Spieltag". */
const SECTION_HEADER_ROW_BY_LEAGUE: Record<League, number> = { BL: 5, L2: 17 };
const SECTION_ROWS = 9; // Standard-Anzahl pro Sektion (Originalvorlage).

export type BLSectionFixture = FixtureRow;
export type BLSection = { league: League; number: number; fixtures: BLSectionFixture[] };
export type BLTipper = ExportTipper;

/** Rückgabe: Buffer + sichtbare Liste der Tipper ohne Vorlagen-Spalte. */
export type BuildBundesligaResult = {
  buffer: Buffer;
  unmatchedTippers: string[];
  droppedSectionCount: number;
};

/** Lädt die Master-Vorlage EINMAL pro Export (sonst doppeltes File-I/O). */
let _templateCache: Buffer | null = null;
async function loadTemplateBuffer(): Promise<Buffer> {
  if (!_templateCache) {
    _templateCache = await readFile(TEMPLATE_PATH);
  }
  return _templateCache;
}

/**
 * Robuster Match für die Vorlage-Spalten: Diakritika weg, alles was keine
 * Unicode-Buchstabe/Ziffer ist weg, lowercase. Wer "Dr. Rock" tippt und im
 * Vorlagen-Header "Dr.Rock" steht, soll nicht aus dem Export fallen.
 * NB: nutzt \p{L}/\p{N} statt ASCII-Klasse, damit auch kyrillisch, griechisch, etc.
 * durchkommen.
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
    .trim();
}

/** Standard-TT = genau 1 BL-Section + 1 L2-Section, beide ≤ 9 Partien (passt in Originalvorlage). */
function isStandardLayout(sections: BLSection[]): boolean {
  const bl = sections.filter((s) => s.league === 'BL');
  const l2 = sections.filter((s) => s.league === 'L2');
  return (
    bl.length === 1 && l2.length === 1 && bl[0].fixtures.length <= SECTION_ROWS && l2[0].fixtures.length <= SECTION_ROWS
  );
}

export async function buildBundesligaExcel(params: {
  matchdayNumber: number;
  dateRange: string;
  sections: BLSection[];
  tippers: BLTipper[];
  tipsByUser: Map<string, TipMap>;
}): Promise<BuildBundesligaResult> {
  const { matchdayNumber, dateRange, sections, tippers, tipsByUser } = params;

  if (isStandardLayout(sections)) {
    const templateBuffer = await loadTemplateBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer as never);
    const ws = workbook.getWorksheet('34.TT');
    if (!ws) {
      throw new Error('Vorlage: Blatt 34.TT nicht gefunden');
    }
    const { matched: tipperColumns, unmatched } = loadTipperColumns(ws, tippers);
    fillStandardSheet({ workbook, ws, matchdayNumber, dateRange, sections, tipperColumns, tipsByUser });
    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), unmatchedTippers: unmatched, droppedSectionCount: 0 };
  }

  // Sonderfall: pro Liga-Sektion ein eigenes Sheet (Multi-Sheet-Variante nimmt ALLE Tipper,
  // keine Template-Spaltenbindung, daher keine "unmatched"-Liste). Vorlage wird trotzdem
  // geladen (für das TW-Blatt etc.), aber nicht das Matchday-Sheet verwendet.
  const templateBuffer = await loadTemplateBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer as never);
  await fillMultiSheet({ workbook, matchdayNumber, dateRange, sections, tippers, tipsByUser });
  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), unmatchedTippers: [], droppedSectionCount: 0 };
}

/**
 * Liest die Tipper-Namen aus dem bereits geladenen Worksheet und mappt sie auf
 * Spalten-Blöcke. Bei doppelten Namen in der Vorlage gewinnt der FRÜHERE Eintrag
 * (stabil) — Map.set() würde sonst den letzten Eintrag nehmen, was bei mehreren
 * "Dr."-Spalten zu nicht-deterministischen Block-Starts führen würde.
 */
function loadTipperColumns(
  ws: ExcelJS.Worksheet,
  tippers: BLTipper[],
): { matched: { tipper: BLTipper; blockStart: number }[]; unmatched: string[] } {
  const nameToBlockStart = new Map<string, number>();
  ws.getRow(3).eachCell((cell, colNumber) => {
    const value = cell.value;
    if (typeof value === 'string' && value.trim() && colNumber > 4) {
      const key = normalizeName(value);
      if (!nameToBlockStart.has(key)) {
        nameToBlockStart.set(key, colNumber - 1);
      }
    }
  });

  const matched: { tipper: BLTipper; blockStart: number }[] = [];
  const unmatched: string[] = [];
  for (const tipper of tippers) {
    const blockStart = nameToBlockStart.get(normalizeName(tipper.name));
    if (blockStart !== undefined) {
      matched.push({ tipper, blockStart });
    } else {
      unmatched.push(tipper.name);
    }
  }
  return { matched, unmatched };
}

/** Standard-Variante: ein Worksheet, Original-Vorlage mit allen Formeln. */
function fillStandardSheet(args: {
  workbook: ExcelJS.Workbook;
  ws: ExcelJS.Worksheet;
  matchdayNumber: number;
  dateRange: string;
  sections: BLSection[];
  tipperColumns: { tipper: BLTipper; blockStart: number }[];
  tipsByUser: Map<string, TipMap>;
}): void {
  const { ws, matchdayNumber, dateRange, sections, tipperColumns, tipsByUser } = args;

  ws.getCell(1, COL_HOME).value = `${matchdayNumber}.TT`;
  ws.getCell(3, COL_HOME).value = dateRange;

  for (const section of sections) {
    const league = section.league;
    const firstRow = FIRST_ROW_BY_LEAGUE[league];
    const headerRow = SECTION_HEADER_ROW_BY_LEAGUE[league];
    // "34. Spieltag" aus der Vorlage überschreiben. Achtung: in der Vorlage steht
    // "1. Liga"/"2. Liga" in Spalte B und "X. Spieltag" in Spalte D.
    ws.getCell(headerRow, COL_AWAY).value = `${section.number}. Spieltag`;
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

  for (const section of sections) {
    // Defensive fallback: League-Wert sollte immer im LEAGUE_SECTION_LABELS sein.
    const leagueLabel = LEAGUE_SECTION_LABELS[section.league] ?? 'Liga';
    // Sheet-Name: Punkte raus (Excel-Style), Whitespace zu '_' (sonst '1 Liga'),
    // Rest auf erlaubte Zeichen reduziert.
    const safeLeague = leagueLabel.replace(/\./g, '').replace(/\s+/g, '_');
    const sheetName = `${matchdayNumber}.TT_${safeLeague}_${section.number}.ST`;
    await addTipperSheetToWorkbook({
      workbook,
      sheetName,
      title: `${matchdayNumber}.TT · ${leagueLabel} · ${section.number}. Spieltag`,
      dateRange,
      tippers,
      fixtures: section.fixtures,
      tipsByUser,
    });
  }
}
