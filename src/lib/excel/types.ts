/**
 * Geteilte Excel-Typen & -Konstanten (SSOT für das Tipper-Block-Raster).
 *
 * Beidseitiger Vertrag: die Exporter (`export-auswertung`, `export-matchday`)
 * SCHREIBEN dieses Raster, der Alt-Saison-Import (`scripts/import-season-2526`)
 * LIEST es. Beide Richtungen ziehen die Geometrie ausschließlich von hier.
 *
 * Die Zeilen-Geometrie der ALTEN Vorlage (zwei feste 9er-Blöcke) steht bewusst
 * NICHT hier, sondern in `scripts/lib/auswertungen.ts` — sie beschreibt nur noch
 * die archivierten Dateien. Der aktuelle Export legt die Sektionen fortlaufend
 * an und kommt mit beliebig vielen Partien klar.
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

export type FixtureRow = { id: string; homeTeam: string; awayTeam: string };
export type TipMap = Map<string, { homeGoals: number; awayGoals: number }>; // fixtureId -> tip
