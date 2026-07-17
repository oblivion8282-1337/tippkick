/**
 * Geteilte Excel-Typen, -Konstanten & -Helfer (SSOT für das Auswertungs-Layout).
 *
 * Das Raster ist ein beidseitiger Vertrag: die Exporter SCHREIBEN es, der
 * Alt-Saison-Import (`scripts/import-season-2526.ts`) LIEST es. Beide Richtungen
 * ziehen die Geometrie ausschließlich von hier.
 */

/** Master-Spalten im Auswertungs-Layout: B=Heim, D=Gast. */
export const COL_HOME = 2;
export const COL_AWAY = 4;

/** Zeile mit den Tipper-Namen (je Block eine Spalte rechts vom Block-Start). */
export const TIPPER_NAME_ROW = 3;
/** Erster Tipper-Block beginnt in Spalte M. */
export const FIRST_TIPPER_COL = 13;
/** Pro Tipper 6 Spalten: Tipp Heim : Gast + Pkt. + Reserve. */
export const TIPPER_BLOCK_WIDTH = 6;

/** Standard-Anzahl Partien pro Liga-Sektion (Originalvorlage). */
export const SECTION_ROWS = 9;

/**
 * Die zwei Liga-Blöcke der Vorlage, rein positionell. `headerRow` trägt in
 * Spalte B das Liga-Label und in Spalte D „N. Spieltag".
 *
 * Bewusst NICHT nach Liga indiziert: welche Liga in welchem Block steht, ist
 * nicht fix. Sonder-Tipptage haben in beiden Blöcken dieselbe Liga (TT 1 der
 * Saison 25/26: 2. Liga ST 1 + 2, weil die Bundesliga noch nicht lief; TT 17:
 * 1. Liga ST 16 + 17). Wer die Liga braucht, liest das Label — er leitet sie
 * nicht aus der Position ab.
 */
export const SECTION_BLOCKS = [
  { headerRow: 5, firstRow: 6 },
  { headerRow: 17, firstRow: 18 },
] as const;

export type FixtureRow = { id: string; homeTeam: string; awayTeam: string };
export type TipMap = Map<string, { homeGoals: number; awayGoals: number }>; // fixtureId -> tip

/**
 * Kanonischer Namens-Schlüssel für den Abgleich Excel ↔ DB: Diakritika weg,
 * alles was keine Unicode-Buchstabe/Ziffer ist weg, lowercase. Wer „Dr. Rock"
 * tippt und im Vorlagen-Header „Dr.Rock" stehen hat, soll nicht aus dem Export
 * fallen.
 *
 * NB: nutzt \p{L}/\p{N} statt einer ASCII-Klasse, damit auch kyrillisch,
 * griechisch etc. durchkommen. Diakritika werden per NFD ENTFERNT (ä → a),
 * nicht transliteriert (ä → ae) — für einen Match-Schlüssel ist nur wichtig,
 * dass beide Seiten dieselbe Regel anwenden.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
    .trim();
}
