import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';

/**
 * Geteilte Basis für die Alt-Saison-Scripts (`import-season-2526`, `verify-season-2526`):
 * Fundort und Zell-Lesen der archivierten Auswertungs-Dateien.
 *
 * Bewusst unter `scripts/` und nicht in `src/lib/`: das Produkt liest niemals
 * Alt-Auswertungen — es schreibt sie nur (siehe `src/lib/excel/`). Das hier ist
 * Einmal-Import-Zubehör. Die Layout-Geometrie dagegen ist ein beidseitiger
 * Vertrag und steht deshalb in `src/lib/excel/types.ts`.
 */

/** Die archivierte Saison, aus der die Testdaten stammen. */
export const SEASON_NAME = '25/26';
/** Anzahl Tipptage der Saison (= Anzahl Auswertungs-Dateien). */
export const MATCHDAY_COUNT = 34;

// ─── Zeilen-Geometrie der archivierten Auswertungs-Vorlage ───────────────────
// Beschreibt AUSSCHLIESSLICH die alten Dateien. Der heutige Export legt seine
// Sektionen fortlaufend an und kennt diese festen Blöcke nicht mehr.

/** Partien pro Liga-Sektion in der Alt-Vorlage. */
export const SECTION_ROWS = 9;

/**
 * Die zwei Liga-Blöcke der Alt-Vorlage, rein positionell. `headerRow` trägt in
 * Spalte B das Liga-Label und in Spalte D „N. Spieltag".
 *
 * Bewusst NICHT nach Liga indiziert: welche Liga in welchem Block steht, ist
 * nicht fix. Sonder-Tipptage haben in beiden Blöcken dieselbe Liga (25/26 TT 1:
 * 2. Liga ST 1 + 2, weil die Bundesliga noch nicht lief; TT 17: 1. Liga ST 16
 * + 17). Wer die Liga braucht, liest das Label — er leitet sie nicht aus der
 * Position ab.
 */
export const SECTION_BLOCKS = [
  { headerRow: 5, firstRow: 6 },
  { headerRow: 17, firstRow: 18 },
] as const;

/**
 * Kanonischer Namens-Schlüssel für den Abgleich Alt-Excel ↔ OpenLigaDB:
 * Diakritika weg (NFD, ä → a), alles was keine Unicode-Buchstabe/Ziffer ist weg,
 * lowercase. Für einen Match-Schlüssel zählt nur, dass beide Seiten dieselbe
 * Regel anwenden.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
    .trim();
}

const AUSWERTUNGEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../Vorlagen/Auswertungen');

/** Pfad zur Auswertungs-Datei eines Tipptags (`10` → `…/10_TT_Auswertung.xlsx`). */
export function auswertungPath(matchdayNumber: number): string {
  return path.join(AUSWERTUNGEN_DIR, `${String(matchdayNumber).padStart(2, '0')}_TT_Auswertung.xlsx`);
}

/** Lädt die Auswertungs-Datei eines Tipptags. */
export async function readAuswertung(matchdayNumber: number): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(auswertungPath(matchdayNumber));
  return workbook;
}

/**
 * Zellwert als Zahl oder null. Formelzellen liefern `{ formula, result }` — das
 * TW-Blatt besteht fast vollständig daraus, deshalb wird `result` mitgelesen.
 */
export function numOf(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === 'object' && 'result' in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  }
  return null;
}

/** Zellwert als Ganzzahl oder null. */
export function intOf(value: ExcelJS.CellValue): number | null {
  const n = numOf(value);
  return n === null ? null : Math.trunc(n);
}

/** Zellwert als getrimmter String oder null (leer → null). */
export function stringOf(value: ExcelJS.CellValue): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
