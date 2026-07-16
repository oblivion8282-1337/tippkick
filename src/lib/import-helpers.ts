import { fetchSeason, type ImportedFixture } from '@/lib/openligadb';
import { SHORTCUT_TO_LEAGUE } from '@/lib/constants';
import type { League } from '@/generated/prisma/client';

/** Importierte Partie inkl. Sektions-Tag (1./2. Liga bei Bundesliga; sonst null). */
export type TaggedFixture = ImportedFixture & { league: League | null };

/** Holt eine ganze Saison über alle Quellen, gruppiert + getaggt nach Spieltag. */
export async function fetchTaggedSeason(shortcuts: string[], year: number): Promise<Map<number, TaggedFixture[]>> {
  const perShortcut = await Promise.all(
    shortcuts.map(async (shortcut) => {
      const league = SHORTCUT_TO_LEAGUE[shortcut] ?? null;
      const seasonMap = await fetchSeason(shortcut, year);
      return [...seasonMap.entries()].map(
        ([group, fixtures]) => [group, fixtures.map((f) => ({ ...f, league }))] as const,
      );
    }),
  );
  const merged = new Map<number, TaggedFixture[]>();
  for (const entries of perShortcut) {
    for (const [group, fixtures] of entries) {
      const arr = merged.get(group) ?? [];
      arr.push(...fixtures);
      merged.set(group, arr);
    }
  }
  return merged;
}

/** Frühester Anstoß einer Partienmenge (signaturgenerisch, mind. ein Element). */
export function earliestKickoff<T extends { kickoff: Date }>(fixtures: T[]): Date {
  return fixtures.reduce((min, f) => (f.kickoff < min ? f.kickoff : min), fixtures[0].kickoff);
}

/** Spätester Anstoß einer Partienmenge (signaturgenerisch, mind. ein Element). */
export function latestKickoff<T extends { kickoff: Date }>(fixtures: T[]): Date {
  return fixtures.reduce((max, f) => (f.kickoff > max ? f.kickoff : max), fixtures[0].kickoff);
}

/** Start-/End-Datum einer Tipprunde aus Anstoß-Zeitstempeln (leer → null). */
export function spanFromKickoffs(kicks: Date[]): { startDate: Date; endDate: Date } | null {
  if (kicks.length === 0) {
    return null;
  }
  let min = kicks[0].getTime();
  let max = min;
  for (let i = 1; i < kicks.length; i++) {
    const t = kicks[i].getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { startDate: new Date(min), endDate: new Date(max) };
}

/** Gruppiert nach Schlüssel; null-Liga landet unter dem Schlüssel `null` (für Single-Liga). */
export function groupBy<T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = out.get(key);
    if (arr) {
      arr.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}
