import type { CompetitionKey, League } from '@/generated/prisma/client';

/**
 * Zentrale Konstanten (SSOT). Bewusst ohne Prisma-Runtime-Import, damit dieses
 * Modul auch in Client Components genutzt werden kann (Typen sind type-only).
 */

/** Erlaubter Tipp-Wertebereich für Tore (Heim/Gast). */
export const MIN_GOALS = 0;
export const MAX_GOALS = 99;

/** Mindestlänge der Passwörter (besser-auth setzt serverseitig dieselbe Grenze). */
export const MIN_PASSWORD_LENGTH = 8;

/** Anzeige-Label je Wettbewerb – eine Quelle, kein Mapping an mehreren Orten. */
export const COMPETITION_LABELS: Record<CompetitionKey, string> = {
  BL: 'Bundesliga (1. + 2. Liga)',
  CL: 'Champions League',
  DFB: 'DFB-Pokal',
  EM: 'Europameisterschaft',
  WM: 'Weltmeisterschaft',
};

/** Kurz-Label (für Tabs/Badges). */
export const COMPETITION_SHORT: Record<CompetitionKey, string> = {
  BL: 'Bundesliga',
  CL: 'Champions League',
  DFB: 'DFB-Pokal',
  EM: 'EM',
  WM: 'WM',
};

/** Wettbewerbs-Reihenfolge. */
export const COMPETITION_ORDER: CompetitionKey[] = ['BL', 'CL', 'DFB', 'EM', 'WM'];

/** OpenLigaDB leagueShortcuts je Wettbewerb (Bundesliga = 1.+2. Liga zusammen). */
export const OPENLIGADB_SHORTCUTS: Record<CompetitionKey, string[]> = {
  BL: ['bl1', 'bl2'],
  CL: ['cl'],
  DFB: ['dfb'],
  EM: [],
  WM: [],
};

/**
 * OpenLigaDB-Shortcut -> Sektion (1./2. Liga) für die Bundes­liga-Partien.
 * Nicht-Bundesliga-Quellen (cl, dfb) haben keine Sektion (null).
 */
export const SHORTCUT_TO_LEAGUE: Record<string, League> = {
  bl1: 'BL',
  bl2: 'L2',
};

/** Sektions-Label + Reihenfolge innerhalb eines Bundesliga-Spieltags. */
export const LEAGUE_SECTION_LABELS: Record<League, string> = {
  BL: '1. Liga',
  L2: '2. Liga',
};
export const LEAGUE_SECTION_ORDER: League[] = ['BL', 'L2'];

/** Wettbewerbe mit vorlagenbasiertem Auswertungs-Export. */
export const TEMPLATE_EXPORT_KEYS: ReadonlySet<CompetitionKey> = new Set(['BL']);

/** Tipp-Deadline = frühester Anstoß minus diese Offset (1 Min, wie im Verein üblich). */
export const DEADLINE_OFFSET_MS = 60_000;
