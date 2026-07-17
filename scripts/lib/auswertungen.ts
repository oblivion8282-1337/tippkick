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
