/** Geteilte Excel-Export-Typen & Konstanten (SSOT für beide Exporter). */

/** Master-Spalten im Auswertungs-Layout: B=Heim, D=Gast. */
export const COL_HOME = 2;
export const COL_AWAY = 4;

export type FixtureRow = { id: string; homeTeam: string; awayTeam: string };
export type TipMap = Map<string, { homeGoals: number; awayGoals: number }>; // fixtureId -> tip
