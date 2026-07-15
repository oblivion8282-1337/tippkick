/**
 * OpenLigaDB-Client (kostenlos, kein API-Key). Holt Spieltage als JSON.
 * Doku: https://www.openligadb.de/api/api-request/
 * Beispiel: https://api.openligadb.de/getmatchdata/bl1/2024/1
 */

const BASE = 'https://api.openligadb.de';

export type OpenLigaMatch = {
  matchDateTime: string; // lokales ISO, z. B. "2024-08-24T15:30:00"
  matchDateTimeUTC: string;
  group: { groupOrderID: number; groupName: string };
  team1: { teamName: string };
  team2: { teamName: string };
  matchIsFinished: boolean;
};

export type ImportedFixture = {
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  groupOrderId: number;
};

/** Holt alle Partien eines Spieltags (group) aus einem Wettbewerb + Saison. */
export async function fetchMatchday(
  leagueShortcut: string,
  seasonYear: number,
  groupOrderId: number,
): Promise<ImportedFixture[]> {
  const url = `${BASE}/getmatchdata/${leagueShortcut}/${seasonYear}/${groupOrderId}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  });

  if (response.status === 404) {
    return []; // Spieltag existiert (noch) nicht
  }
  if (!response.ok) {
    throw new Error(`OpenLigaDB-Fehler ${response.status} für ${url}`);
  }

  const matches = (await response.json()) as OpenLigaMatch[];
  return matches.map((m) => ({
    homeTeam: m.team1.teamName,
    awayTeam: m.team2.teamName,
    kickoff: new Date(m.matchDateTime),
    groupOrderId: m.group.groupOrderID,
  }));
}

/** Holt eine komplette Saison (ein API-Call), gruppiert nach Spieltag-Nummer. */
export async function fetchSeason(leagueShortcut: string, seasonYear: number): Promise<Map<number, ImportedFixture[]>> {
  const url = `${BASE}/getmatchdata/${leagueShortcut}/${seasonYear}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!response.ok) {
    throw new Error(`OpenLigaDB-Fehler ${response.status} für ${url}`);
  }
  const matches = (await response.json()) as OpenLigaMatch[];

  const byGroup = new Map<number, ImportedFixture[]>();
  for (const m of matches) {
    const fixtures = byGroup.get(m.group.groupOrderID) ?? [];
    fixtures.push({
      homeTeam: m.team1.teamName,
      awayTeam: m.team2.teamName,
      kickoff: new Date(m.matchDateTime),
      groupOrderId: m.group.groupOrderID,
    });
    byGroup.set(m.group.groupOrderID, fixtures);
  }
  return byGroup;
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
