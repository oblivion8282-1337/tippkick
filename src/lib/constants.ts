import type { CompetitionKey } from '@/generated/prisma/client';

/**
 * Zentrale Konstanten (SSOT). Bewusst ohne Prisma-Runtime-Import, damit dieses
 * Modul auch in Client Components genutzt werden kann (CompetitionKey ist type-only).
 */

/** Erlaubter Tipp-Wertebereich für Tore (Heim/Gast). */
export const MIN_GOALS = 0;
export const MAX_GOALS = 99;

/** Mindestlänge der Passwörter (besser-auth setzt serverseitig dieselbe Grenze). */
export const MIN_PASSWORD_LENGTH = 8;

/** Anzeige-Label je Wettbewerb – eine Quelle, kein Mapping an mehreren Orten. */
export const COMPETITION_LABELS: Record<CompetitionKey, string> = {
  BL: '1. Bundesliga',
  L2: '2. Bundesliga',
  CL: 'Champions League',
  DFB: 'DFB-Pokal',
  EM: 'Europameisterschaft',
  WM: 'Weltmeisterschaft',
};

/** Kurz-Label (für Tabs/Badges, platzsparend). */
export const COMPETITION_SHORT: Record<CompetitionKey, string> = {
  BL: '1. Liga',
  L2: '2. Liga',
  CL: 'Champions League',
  DFB: 'DFB-Pokal',
  EM: 'EM',
  WM: 'WM',
};

/** Wettbewerbs-Reihenfolge (Ligen zuerst). */
export const COMPETITION_ORDER: CompetitionKey[] = ['BL', 'L2', 'CL', 'DFB', 'EM', 'WM'];

/** OpenLigaDB leagueShortcut je Wettbewerb (None = keine Autoquelle, z. B. EM/WM jahresabhängig). */
export const OPENLIGADB_SHORTCUTS: Partial<Record<CompetitionKey, string>> = {
  BL: 'bl1',
  L2: 'bl2',
  DFB: 'dfb',
  CL: 'cl',
};

/** Wettbewerbe mit vorlagenbasiertem Auswertungs-Export (BL+L2 in einem Blatt). */
export const TEMPLATE_EXPORT_KEYS: ReadonlySet<CompetitionKey> = new Set(['BL', 'L2']);

/** Tipp-Deadline = earliest kickoff minus diese Offset (1 Min, wie im Verein üblich). */
export const DEADLINE_OFFSET_MS = 60_000;
