import type { League } from '@/generated/prisma/client';

/**
 * Zentrale Konstanten (SSOT). bewusst ohne Prisma-Runtime-Import, damit dieses
 * Modul auch in Client Components genutzt werden kann (League ist type-only).
 */

/** Erlaubter Tipp-Wertebereich für Tore (Heim/Gast). */
export const MIN_GOALS = 0;
export const MAX_GOALS = 99;

/** Mindestlänge der Passwörter (besser-auth setzt serverseitig dieselbe Grenze). */
export const MIN_PASSWORD_LENGTH = 8;

/** Anzeige-Label je Liga – eine Quelle, kein 'BL' ? '1. Liga' an mehreren Orten. */
export const LEAGUE_LABELS: Record<League, string> = {
  BL: '1. Liga',
  L2: '2. Liga',
};

/** Ligareihenfolge (1. Liga vor 2. Liga) – einheitlich in UI und Export. */
export const LEAGUE_ORDER: League[] = ['BL', 'L2'];

/** Wandelt einen Form-/JSON-Wert in eine Liga um (Default 2. Liga bei Ungültigem). */
export function parseLeague(value: string | null | undefined): League {
  return LEAGUE_ORDER.includes(value as League) ? (value as League) : 'L2';
}
