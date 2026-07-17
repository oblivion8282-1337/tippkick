import type { CompetitionKey, FixtureStatus, League } from '@/generated/prisma/client';

/**
 * Zentrale Konstanten (SSOT). Bewusst ohne Prisma-Runtime-Import, damit dieses
 * Modul auch in Client Components genutzt werden kann (Typen sind type-only).
 */

/** Erlaubter Tipp-Wertebereich für Tore (Heim/Gast). */
export const MIN_GOALS = 0;
export const MAX_GOALS = 99;

/** Ganzzahl in den Tipp-Wertebereich 0..MAX_GOALS einspannen (SSOT für Tore & Zusatzpunkte). */
export function clampGoals(value: number): number {
  return Math.min(MAX_GOALS, Math.max(MIN_GOALS, Number.isFinite(value) ? Math.trunc(value) : 0));
}

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

/**
 * OpenLigaDB leagueShortcuts je Wettbewerb. Bundesliga wird aus BL1+BL2 importiert;
 * die importierten Spieltage liegen erst unzugeordnet und werden vom Admin in
 * Tipptage gruppiert (siehe /admin/spieltage), weil das OpenLigaDB-Spieltag-Raster
 * nicht 1:1 dem Vereinraster entspricht (TT 1 = nur L2 1+2, TT 2 = BL 1 + L2, …).
 */
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

/** Inverse zu SHORTCUT_TO_LEAGUE (einziges Mapping, hier abgeleitet). */
export const LEAGUE_SHORTCUTS = Object.fromEntries(
  Object.entries(SHORTCUT_TO_LEAGUE).map(([shortcut, league]) => [league, shortcut]),
) as Record<League, string>;

/** Sektions-Label + Reihenfolge innerhalb eines Bundesliga-Spieltags. */
export const LEAGUE_SECTION_LABELS: Record<League, string> = {
  BL: '1. Liga',
  L2: '2. Liga',
};
export const LEAGUE_SECTION_ORDER: League[] = ['BL', 'L2'];

/** Wettbewerbe mit vorlagenbasiertem Auswertungs-Export. */
export const TEMPLATE_EXPORT_KEYS: ReadonlySet<CompetitionKey> = new Set(['BL']);

/** Anzeige-Label je Spiel-Status (SSOT für Formulare + Parsing). */
export const FIXTURE_STATUS_LABELS: Record<FixtureStatus, string> = {
  SCHEDULED: 'geplant',
  IN_PROGRESS: 'läuft',
  FINISHED: 'beendet',
  CANCELLED: 'abgesagt',
  POSTPONED: 'verlegt',
};

/** Tipp-Deadline = frühester Anstoß minus diese Offset (1 Min, wie im Verein üblich). */
export const DEADLINE_OFFSET_MS = 60_000;

/**
 * Rollen-Konstanten (SSOT – nicht als Magic Strings im Code verstreuen).
 * better-auth admin-Plugin speichert diese exakt so in `User.role`.
 */
export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';
export const ROLES = [ROLE_ADMIN, ROLE_USER] as const;
export type Role = (typeof ROLES)[number];

/** Maximale Länge für vom Admin eingegebene Freitext-Felder (Team-Namen, Saison-Name). */
export const MAX_TEXT_LENGTH = 80;
