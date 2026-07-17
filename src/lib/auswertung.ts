import { getMatchdayAdmin } from '@/lib/admin';
import { loadTipsByUser } from '@/lib/tipps';
import { getEligibleTippers } from '@/lib/tippers';
import { isFixtureScoreable, scoreTip } from '@/lib/scoring';
import { LEAGUE_SECTION_LABELS, LEAGUE_SECTION_ORDER, WEEKDAY_LABELS } from '@/lib/constants';
import { formatDateRange, weekdayOf } from '@/lib/datetime';
import type { FixtureStatus, League } from '@/generated/prisma/client';

/** Tipp-Zelle im 34.TT-Raster: Tipp + berechnete Punkte (null = nicht bewertbar). */
export type TipCell = {
  tipHome: number | null;
  tipAway: number | null;
  points: 0 | 1 | 2 | 3 | null;
};

export type AuswertungFixture = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  resultHome: number | null;
  resultAway: number | null;
  scoreable: boolean;
  status: FixtureStatus;
};

export type AuswertungSection = {
  league: League;
  label: string;
  sectionNumber: number;
  fixtures: AuswertungFixture[];
};

/**
 * Tagesspalte eines Tipptags: Wochentag (0 = So … 6 = Sa) + Kürzel. Welche Tage
 * ein Tipptag hat, ergibt sich aus seinen Anstößen — nicht aus einem festen
 * Raster (das Alt-Excel hatte vier feste Fächer und musste bei englischen Wochen
 * Tage zusammenfalten; siehe 17_TT_Auswertung.xlsx).
 */
export type DayColumn = { key: number; label: string };
/** Punkte je Wochentag, indiziert wie DayColumn.key. Fehlender Tag = keine Partie. */
export type DailyPoints = Record<number, number>;
export type HitCounts = { three: number; two: number; one: number };

export type TipperRow = {
  id: string;
  name: string;
  tipsByFixture: Map<string, TipCell>;
  blPoints: number;
  l2Points: number;
  daily: DailyPoints;
  counts: HitCounts;
  totalPoints: number;
};

export type PointTotals = {
  total: number;
  bl: number;
  l2: number;
  daily: DailyPoints;
  counts: HitCounts;
};

export type AuswertungView = {
  matchdayNumber: number;
  /** Tagesspalten dieses Tipptags, chronologisch nach frühestem Anstoß. */
  days: DayColumn[];
  competitionName: string;
  seasonName: string;
  dateRangeLabel: string;
  sections: AuswertungSection[];
  tippers: TipperRow[];
  hasAnyScoreable: boolean;
  totals: PointTotals;
  averages: PointTotals;
};

/**
 * Die Tagesspalten eines Tipptags: jeder tatsächlich bespielte Wochentag genau
 * einmal, sortiert nach dem frühesten Anstoß an diesem Tag (nicht nach Wochentag-
 * Index — sonst stünde bei einer englischen Woche Di vor dem Fr davor).
 */
function dayColumnsOf(fixtures: { kickoff: Date }[]): DayColumn[] {
  const earliest = new Map<number, number>();
  for (const f of fixtures) {
    const key = weekdayOf(f.kickoff);
    const at = f.kickoff.getTime();
    const known = earliest.get(key);
    if (known === undefined || at < known) {
      earliest.set(key, at);
    }
  }
  return [...earliest.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => ({ key, label: WEEKDAY_LABELS[key] }));
}

type ScoredFixture = AuswertungFixture & { league: League; result: { homeGoals: number; awayGoals: number } | null };

/**
 * Online-Auswertung (SSOT): TT-Raster + TW-Aggregate pro Tipper, berechnet
 * aus Endergebnissen (Fixture) + Tipps.
 */
export async function buildAuswertung(matchdayId: string): Promise<AuswertungView | null> {
  // Matchday und Tipper sind unabhängig – parallel laden; nur loadTipsByUser
  // braucht die fixtureIds und folgt danach.
  const [matchday, tippers] = await Promise.all([getMatchdayAdmin(matchdayId), getEligibleTippers()]);
  if (!matchday) {
    return null;
  }

  const sections: AuswertungSection[] = matchday.sections
    .filter((s): s is typeof s & { league: League } => s.league !== null)
    .sort((a, b) => LEAGUE_SECTION_ORDER.indexOf(a.league) - LEAGUE_SECTION_ORDER.indexOf(b.league))
    .map((s) => ({
      league: s.league,
      label: LEAGUE_SECTION_LABELS[s.league],
      sectionNumber: s.number,
      fixtures: s.fixtures.map((f) => ({
        id: f.id,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        kickoff: f.kickoff,
        resultHome: f.homeGoals,
        resultAway: f.awayGoals,
        scoreable: isFixtureScoreable(f),
        status: f.status,
      })),
    }));

  // Flache, mit Liga/Ergebnis angereicherte Partien-Liste für die Aggregation.
  const scored: ScoredFixture[] = sections.flatMap((s) =>
    s.fixtures.map((f) => ({
      ...f,
      league: s.league,
      result:
        f.scoreable && f.resultHome !== null && f.resultAway !== null
          ? { homeGoals: f.resultHome, awayGoals: f.resultAway }
          : null,
    })),
  );
  const tipsByUser = await loadTipsByUser(scored.map((f) => f.id));

  const days = dayColumnsOf(scored);

  const tipperRows: TipperRow[] = tippers.map((t) => {
    const userTips = tipsByUser.get(t.id);
    const tipsByFixture = new Map<string, TipCell>();
    let blPoints = 0;
    let l2Points = 0;
    const daily: DailyPoints = emptyDaily(days);
    const counts: HitCounts = { three: 0, two: 0, one: 0 };

    for (const f of scored) {
      const tip = userTips?.get(f.id);
      const tipHome = tip?.homeGoals ?? null;
      const tipAway = tip?.awayGoals ?? null;
      const points = f.result && tip ? scoreTip(f.result, tip) : null;
      tipsByFixture.set(f.id, { tipHome, tipAway, points });

      if (points !== null) {
        if (f.league === 'BL') blPoints += points;
        else l2Points += points;
        daily[weekdayOf(f.kickoff)] += points;
        if (points === 3) counts.three += 1;
        else if (points === 2) counts.two += 1;
        else if (points === 1) counts.one += 1;
      }
    }

    const totalPoints = blPoints + l2Points;
    return { id: t.id, name: t.name, tipsByFixture, blPoints, l2Points, daily, counts, totalPoints };
  });

  return {
    matchdayNumber: matchday.number,
    days,
    competitionName: matchday.competition.name,
    seasonName: matchday.competition.season.name,
    dateRangeLabel: formatDateRange(matchday.startDate, matchday.endDate),
    sections,
    tippers: tipperRows,
    hasAnyScoreable: sections.some((s) => s.fixtures.some((f) => f.scoreable)),
    ...aggregateTotals(tipperRows, days),
  };
}

/** Nullwerte für genau die Tage eines Tipptags. */
function emptyDaily(days: DayColumn[]): DailyPoints {
  return Object.fromEntries(days.map((d) => [d.key, 0]));
}

/** Feldweise Abbildung über die PointTotals-Form — eine Stelle kennt die Felder. */
function mapTotals(t: PointTotals, f: (value: number) => number): PointTotals {
  return {
    total: f(t.total),
    bl: f(t.bl),
    l2: f(t.l2),
    daily: Object.fromEntries(Object.entries(t.daily).map(([key, value]) => [key, f(value)])),
    counts: { three: f(t.counts.three), two: f(t.counts.two), one: f(t.counts.one) },
  };
}

/** Summe und Ø über alle Tipper (für die TW-Summen-/Schnittzeile). */
function aggregateTotals(tippers: TipperRow[], days: DayColumn[]): { totals: PointTotals; averages: PointTotals } {
  const totals: PointTotals = {
    total: 0,
    bl: 0,
    l2: 0,
    daily: emptyDaily(days),
    counts: { three: 0, two: 0, one: 0 },
  };
  for (const t of tippers) {
    totals.total += t.totalPoints;
    totals.bl += t.blPoints;
    totals.l2 += t.l2Points;
    for (const day of days) {
      totals.daily[day.key] += t.daily[day.key];
    }
    totals.counts.three += t.counts.three;
    totals.counts.two += t.counts.two;
    totals.counts.one += t.counts.one;
  }
  const n = tippers.length || 1;
  const averages = mapTotals(totals, (v) => Math.round((v / n) * 100) / 100);
  return { totals, averages };
}
