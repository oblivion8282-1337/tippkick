/**
 * Punkte-Regel (SSOT) – entschlüsselt aus der Formel im Vorlagen-Blatt „34.TT".
 * Rein, ohne Prisma/seitliche Effekte; Grundlage für die Online-Auswertung
 * und (später) beliebige weitere Verbraucher.
 *
 *   3 = exaktes Ergebnis
 *   2 = richtige Tordifferenz (aber nicht exakt)
 *   1 = richtige Tendenz (beide unentschieden ODER gleicher Sieger)
 *   0 = sonst
 */

export type FixtureScore = { homeGoals: number; awayGoals: number };

/** Struktureller Fixture-Anteil für die Bewertbar­keitsprüfung (ohne Prisma-Abhängigkeit). */
export type FixtureResultInfo = { status: string; homeGoals: number | null; awayGoals: number | null };

/**
 * Partie ist bewertbar: FINISHED mit beiden Toren. SSOT – eine Stelle für die
 * Präbedingung der Punkteberechnung (parallel zum FINISHED⇒Tore-Invariant).
 */
export function isFixtureScoreable(f: FixtureResultInfo): boolean {
  return f.status === 'FINISHED' && f.homeGoals !== null && f.awayGoals !== null;
}

function sign(n: number): -1 | 0 | 1 {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

/** Exakt richtig (Heim- und Gasttore passen). */
function isExactHit(result: FixtureScore, tip: FixtureScore): boolean {
  return result.homeGoals === tip.homeGoals && result.awayGoals === tip.awayGoals;
}

/** Richtige Tordifferenz (Heim-Gast-Differenz stimmt überein). */
function isGoalDifferenceHit(result: FixtureScore, tip: FixtureScore): boolean {
  return result.homeGoals - result.awayGoals === tip.homeGoals - tip.awayGoals;
}

/** Richtige Tendenz: beide unentschieden ODER derselbe Sieger. */
function isTendencyHit(result: FixtureScore, tip: FixtureScore): boolean {
  const rDiff = result.homeGoals - result.awayGoals;
  const tDiff = tip.homeGoals - tip.awayGoals;
  // Draw vs. Nicht-Draw ist keine Tendenz – die Seite muss identisch sein.
  return (rDiff === 0) === (tDiff === 0) && sign(rDiff) === sign(tDiff);
}

/** Punkte für einen Tipp gemäß 3/2/1-Regel. */
export function scoreTip(result: FixtureScore, tip: FixtureScore): 0 | 1 | 2 | 3 {
  if (isExactHit(result, tip)) return 3;
  if (isGoalDifferenceHit(result, tip)) return 2;
  if (isTendencyHit(result, tip)) return 1;
  return 0;
}
