/**
 * OpenLigaDB-Client (kostenlos, kein API-Key). Holt Spieltage als JSON.
 * Doku: https://www.openligadb.de/api/api-request/
 * Beispiel: https://api.openligadb.de/getmatchdata/bl1/2024/1
 */

const BASE = 'https://api.openligadb.de';

export type OpenLigaMatchResult = {
  resultName: string; // "Endergebnis" | "Halbzeit" | … (stabil; nicht resultTypeID nutzen)
  resultTypeID: number;
  pointsTeam1: number;
  pointsTeam2: number;
};

export type OpenLigaMatch = {
  matchID: number; // OpenLigaDB-ID — Schlüssel für den Ergebnis-Sync (→ Fixture.externalId)
  matchDateTime: string; // tz-naive lokale Zeit (DE) – NICHT zum Speichern verwenden
  matchDateTimeUTC: string; // ISO-String mit 'Z' – SSOT für kickoff (kein TZ-Drift)
  group: { groupOrderID: number; groupName: string };
  team1: { teamName: string };
  team2: { teamName: string };
  matchIsFinished: boolean;
  matchResults: OpenLigaMatchResult[];
};

export type ImportedFixture = {
  externalId: string; // String(matchID)
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  groupOrderId: number;
  finished: boolean;
  homeGoals?: number; // Endergebnis (falls schon gespielt)
  awayGoals?: number;
  htHomeGoals?: number; // Halbzeitstand (falls vorhanden)
  htAwayGoals?: number;
};

/** Aliasse, die OpenLigaDB über die Jahre für denselben Halbzeit-Eintrag genutzt hat. */
const HALFTIME_RESULT_NAMES = ['Halbzeit', 'Halbzeitergebnis'] as const;

/**
 * Mappt matchResults → Endergebnis + Halbzeit. Schlüssel ist resultName (stabil),
 * NICHT resultTypeID (dessen Bedeutung über Saisons/Daten-Ära schwankt).
 */
function extractResult(match: OpenLigaMatch): {
  homeGoals?: number;
  awayGoals?: number;
  htHomeGoals?: number;
  htAwayGoals?: number;
} {
  const final = match.matchResults.find((r) => r.resultName === 'Endergebnis');
  const halftime = match.matchResults.find((r) => HALFTIME_RESULT_NAMES.includes(r.resultName as never));
  return {
    ...(final ? { homeGoals: final.pointsTeam1, awayGoals: final.pointsTeam2 } : {}),
    ...(halftime ? { htHomeGoals: halftime.pointsTeam1, htAwayGoals: halftime.pointsTeam2 } : {}),
  };
}

/**
 * Runtime-Check für eine OpenLigaMatch-Antwort. Wirft früh, statt in toImported
 * mitten in der Saison-Iteration an einer Null.team1.teamName zu krepieren.
 * Auch kickoff-Datumsstring muss parseable sein (sonst landet Invalid Date in Postgres).
 */
function isValidMatch(value: unknown): value is OpenLigaMatch {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const m = value as Record<string, unknown>;
  if (
    typeof m.matchID !== 'number' ||
    typeof m.matchDateTimeUTC !== 'string' ||
    m.matchDateTimeUTC.length === 0 ||
    !Number.isFinite(new Date(m.matchDateTimeUTC).getTime()) ||
    typeof (m.group as { groupOrderID?: unknown })?.groupOrderID !== 'number' ||
    typeof (m.team1 as { teamName?: unknown })?.teamName !== 'string' ||
    typeof (m.team2 as { teamName?: unknown })?.teamName !== 'string' ||
    typeof m.matchIsFinished !== 'boolean' ||
    !Array.isArray(m.matchResults)
  ) {
    return false;
  }
  // Per-Element-Validierung der Ergebnis-Einträge.
  return m.matchResults.every(isValidMatchResult);
}

function isValidMatchResult(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.resultName === 'string' &&
    typeof r.resultTypeID === 'number' &&
    typeof r.pointsTeam1 === 'number' &&
    Number.isFinite(r.pointsTeam1) &&
    typeof r.pointsTeam2 === 'number' &&
    Number.isFinite(r.pointsTeam2)
  );
}

/** Wandelt eine OpenLigaDB-Partie in eine importierte Partie (inkl. Ergebnis) um. */
function toImported(match: OpenLigaMatch): ImportedFixture {
  // matchDateTimeUTC ist garantiert ISO-Z; vermeidet Server-TZ-Drift.
  // Fallback auf matchDateTime nur, falls die API die UTC-Variante nicht liefert.
  const kickoffUtc = match.matchDateTimeUTC || match.matchDateTime;
  return {
    externalId: String(match.matchID),
    homeTeam: match.team1.teamName,
    awayTeam: match.team2.teamName,
    kickoff: new Date(kickoffUtc),
    groupOrderId: match.group.groupOrderID,
    finished: match.matchIsFinished,
    ...extractResult(match),
  };
}

/** User-Agent für OpenLigaDB (sonst throttlen manche Proxies). */
const USER_AGENT = 'Tippkick/1.0 (+https://github.com/local/tippkick)';

/** Timeout pro HTTP-Request gegen OpenLigaDB. */
const FETCH_TIMEOUT_MS = 15_000;
/** Anzahl Versuche bei transienten Fehlern (Netzwerk, 5xx, 429). */
const RETRY_ATTEMPTS = 3;
/** Backoff zwischen Versuchen in ms (verdoppelt sich pro Versuch). */
const RETRY_BASE_MS = 500;

/** Holt eine URL als JSON mit Timeout, Retry und User-Agent. */
async function fetchJson(url: string, attempts = RETRY_ATTEMPTS): Promise<unknown> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (response.status === 404) {
        return null;
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt < attempts) {
          await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`OpenLigaDB-Fehler ${response.status} für ${url}`);
      }
      if (!response.ok) {
        throw new Error(`OpenLigaDB-Fehler ${response.status} für ${url}`);
      }
      return await response.json();
    } catch (error) {
      const lastAttempt = attempt === attempts;
      if (lastAttempt || !isTransient(error)) {
        throw error;
      }
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`OpenLigaDB: unerwartetes Ende für ${url}`);
}

/** Eigener Sleep ohne Timer-Leak bei Abbruch. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Klassifiziert einen Fetch-Fehler als transient (retry lohnt). */
function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // AbortError (Timeout), TypeError (Netzwerk), …
  return error.name === 'AbortError' || error.name === 'TypeError';
}

/** Holt alle Partien eines Spieltags (group) aus einem Wettbewerb + Saison. */
export async function fetchMatchday(
  leagueShortcut: string,
  seasonYear: number,
  groupOrderId: number,
): Promise<ImportedFixture[]> {
  const url = `${BASE}/getmatchdata/${leagueShortcut}/${seasonYear}/${groupOrderId}`;
  const data = await fetchJson(url);
  if (data === null) {
    return []; // 404: Spieltag existiert (noch) nicht
  }
  const matches = parseMatchArray(data);
  return matches.map(toImported);
}

/** Holt eine komplette Saison (ein API-Call), gruppiert nach Spieltag-Nummer.
 *  404 oder Not-Yet-Published → leere Map (Caller kann 'empty' als ok werten). */
export async function fetchSeason(leagueShortcut: string, seasonYear: number): Promise<Map<number, ImportedFixture[]>> {
  const url = `${BASE}/getmatchdata/${leagueShortcut}/${seasonYear}`;
  const data = await fetchJson(url);
  if (data === null) {
    return new Map(); // 404: Saison existiert (noch) nicht
  }
  const matches = parseMatchArray(data);

  const byGroup = new Map<number, ImportedFixture[]>();
  for (const m of matches) {
    const fixtures = byGroup.get(m.group.groupOrderID) ?? [];
    fixtures.push(toImported(m));
    byGroup.set(m.group.groupOrderID, fixtures);
  }
  return byGroup;
}

/** Validiert eine OpenLigaDB-Liste zur Laufzeit; verwirft offensichtlichen Müll mit Log. */
function parseMatchArray(data: unknown): OpenLigaMatch[] {
  if (!Array.isArray(data)) {
    throw new Error('OpenLigaDB-Antwort ist kein Array');
  }
  const valid: OpenLigaMatch[] = [];
  let dropped = 0;
  for (const item of data) {
    if (isValidMatch(item)) {
      valid.push(item);
    } else {
      dropped++;
    }
  }
  if (dropped > 0) {
    console.warn(`[openligadb] ${dropped} invalide Matches verworfen (Runtime-Validation)`);
  }
  return valid;
}

/**
 * Wandelt unseren Saisonnamen ("25/26" oder "2025/26" oder "2025") in die
 * OpenLigaDB-Saison (Startjahr, 4-stellig) um.
 */
export function seasonToYear(seasonName: string): number {
  const first = seasonName.split('/')[0].trim();
  const n = Number.parseInt(first, 10);
  if (Number.isNaN(n)) {
    return new Date().getFullYear();
  }
  return n < 100 ? 2000 + n : n;
}
