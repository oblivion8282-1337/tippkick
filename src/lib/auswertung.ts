import { prisma } from '@/lib/prisma';
import { getMatchdayAdmin } from '@/lib/admin';
import { loadTipsByUser } from '@/lib/tipps';
import { getEligibleTippers } from '@/lib/tippers';
import { isFixtureScoreable, scoreTip } from '@/lib/scoring';
import { LEAGUE_SECTION_LABELS, LEAGUE_SECTION_ORDER } from '@/lib/constants';
import { formatDateRange } from '@/lib/datetime';
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

export type DailyPoints = { fr: number; sa: number; so: number; mo: number };
export type HitCounts = { three: number; two: number; one: number };

export type TipperRow = {
  id: string;
  name: string;
  tipsByFixture: Map<string, TipCell>;
  blPoints: number;
  l2Points: number;
  daily: DailyPoints;
  counts: HitCounts;
  bonusPts: number;
  totalPoints: number; // ohne ZP
  totalWithBonus: number; // inkl. ZP
};

export type PointTotals = {
  total: number;
  bl: number;
  l2: number;
  daily: DailyPoints;
  counts: HitCounts;
  bonus: number;
  withBonus: number;
};

export type AuswertungView = {
  matchdayId: string;
  matchdayNumber: number;
  competitionName: string;
  seasonName: string;
  dateRangeLabel: string;
  sections: AuswertungSection[];
  tippers: TipperRow[];
  hasAnyScoreable: boolean;
  totals: PointTotals;
  averages: PointTotals;
};

/** Wochentag-Bucket nach Anstoß (Fr/Sa/So/Mo – die Tipptag-Tage). */
function dayOf(d: Date): keyof DailyPoints | null {
  switch (d.getDay()) {
    case 5:
      return 'fr';
    case 6:
      return 'sa';
    case 0:
      return 'so';
    case 1:
      return 'mo';
    default:
      return null;
  }
}

type ScoredFixture = AuswertungFixture & { league: League; result: { homeGoals: number; awayGoals: number } | null };

/**
 * Online-Auswertung (SSOT): 34.TT-Raster + TW-Aggregate pro Tipper, berechnet
 * aus Endergebnissen (Fixture) + Tipps + manuellen Zusatzpunkten.
 */
export async function buildAuswertung(matchdayId: string): Promise<AuswertungView | null> {
  // Matchday, Tipper und Zusatzpunkte sind unabhängig – parallel laden; nur
  // loadTipsByUser braucht die fixtureIds und folgt danach.
  const [matchday, tippers, bonuses] = await Promise.all([
    getMatchdayAdmin(matchdayId),
    getEligibleTippers(),
    prisma.matchdayBonus.findMany({
      where: { matchdayId },
      select: { userId: true, bonusPts: true },
    }),
  ]);
  if (!matchday) {
    return null;
  }
  const bonusByUser = new Map(bonuses.map((b) => [b.userId, b.bonusPts]));

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

  const tipperRows: TipperRow[] = tippers.map((t) => {
    const userTips = tipsByUser.get(t.id);
    const tipsByFixture = new Map<string, TipCell>();
    let blPoints = 0;
    let l2Points = 0;
    const daily: DailyPoints = { fr: 0, sa: 0, so: 0, mo: 0 };
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
        const day = dayOf(f.kickoff);
        if (day) daily[day] += points;
        if (points === 3) counts.three += 1;
        else if (points === 2) counts.two += 1;
        else if (points === 1) counts.one += 1;
      }
    }

    const bonusPts = bonusByUser.get(t.id) ?? 0;
    const totalPoints = blPoints + l2Points;
    return {
      id: t.id,
      name: t.name,
      tipsByFixture,
      blPoints,
      l2Points,
      daily,
      counts,
      bonusPts,
      totalPoints,
      totalWithBonus: totalPoints + bonusPts,
    };
  });

  return {
    matchdayId,
    matchdayNumber: matchday.number,
    competitionName: matchday.competition.name,
    seasonName: matchday.competition.season.name,
    dateRangeLabel: formatDateRange(matchday.startDate, matchday.endDate),
    sections,
    tippers: tipperRows,
    hasAnyScoreable: sections.some((s) => s.fixtures.some((f) => f.scoreable)),
    ...aggregateTotals(tipperRows),
  };
}

function emptyTotals(): PointTotals {
  return {
    total: 0,
    bl: 0,
    l2: 0,
    daily: { fr: 0, sa: 0, so: 0, mo: 0 },
    counts: { three: 0, two: 0, one: 0 },
    bonus: 0,
    withBonus: 0,
  };
}

/** Summe und Ø über alle Tipper (für die TW-Summen-/Schnittzeile). */
function aggregateTotals(tippers: TipperRow[]): { totals: PointTotals; averages: PointTotals } {
  const totals = emptyTotals();
  for (const t of tippers) {
    totals.total += t.totalPoints;
    totals.bl += t.blPoints;
    totals.l2 += t.l2Points;
    totals.daily.fr += t.daily.fr;
    totals.daily.sa += t.daily.sa;
    totals.daily.so += t.daily.so;
    totals.daily.mo += t.daily.mo;
    totals.counts.three += t.counts.three;
    totals.counts.two += t.counts.two;
    totals.counts.one += t.counts.one;
    totals.bonus += t.bonusPts;
    totals.withBonus += t.totalWithBonus;
  }
  const n = tippers.length || 1;
  const div = (v: number) => Math.round((v / n) * 100) / 100;
  const averages: PointTotals = {
    total: div(totals.total),
    bl: div(totals.bl),
    l2: div(totals.l2),
    daily: {
      fr: div(totals.daily.fr),
      sa: div(totals.daily.sa),
      so: div(totals.daily.so),
      mo: div(totals.daily.mo),
    },
    counts: {
      three: div(totals.counts.three),
      two: div(totals.counts.two),
      one: div(totals.counts.one),
    },
    bonus: div(totals.bonus),
    withBonus: div(totals.withBonus),
  };
  return { totals, averages };
}
