import { prisma } from '@/lib/prisma';

/**
 * Notfalltipp (SSOT): Grund-Standardergebnis + Sonderregeln pro Mannschaft.
 * Wirkt nie als gespeicherter Tipp, sondern als Fallback bei der Auswertung —
 * resolveEmergencyTip liefert für eine ungetippte Partie den Ersatzwert.
 */

export type EmergencyConfig = {
  defaultHome: number;
  defaultAway: number;
  rules: { id: string; teamName: string; goalsFor: number; goalsAgainst: number }[];
};

/** Notfalltipp eines Users inkl. Sonderregeln (null = keiner konfiguriert). */
export async function getEmergencyConfig(userId: string): Promise<EmergencyConfig | null> {
  const tip = await prisma.emergencyTip.findUnique({
    where: { userId },
    include: { teamRules: true },
  });
  if (!tip) return null;
  return {
    defaultHome: tip.defaultHome,
    defaultAway: tip.defaultAway,
    rules: tip.teamRules.map((r) => ({ id: r.id, teamName: r.teamName, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst })),
  };
}

/**
 * Ersatztipp für eine Partie: Sonderregel der beteiligten Mannschaft gewinnt
 * (heim wie auswärts — auswärts gespiegelt), sonst die Grundregel.
 * Rückgabe null = kein Notfalltipp konfiguriert.
 */
export function resolveEmergencyTip(
  config: EmergencyConfig | null,
  homeTeam: string,
  awayTeam: string,
): { homeGoals: number; awayGoals: number } | null {
  if (!config) return null;
  const homeRule = config.rules.find((r) => r.teamName === homeTeam);
  if (homeRule) {
    return { homeGoals: homeRule.goalsFor, awayGoals: homeRule.goalsAgainst };
  }
  const awayRule = config.rules.find((r) => r.teamName === awayTeam);
  if (awayRule) {
    return { homeGoals: awayRule.goalsAgainst, awayGoals: awayRule.goalsFor };
  }
  return { homeGoals: config.defaultHome, awayGoals: config.defaultAway };
}
