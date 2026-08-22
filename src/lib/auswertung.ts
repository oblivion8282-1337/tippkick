import { getMatchdayAdmin } from '@/lib/admin';
import { loadTipsByUser } from '@/lib/tipps';
import { resolveEmergencyTip, type EmergencyConfig } from '@/lib/emergency-tip';
import { getEligibleTippers } from '@/lib/tippers';
import { isFixtureScoreable, scoreTip } from '@/lib/scoring';
import { LEAGUE_SECTION_LABELS, LEAGUE_SECTION_ORDER } from '@/lib/constants';
import { dateKeyOf, formatDateRange, formatDayMonth, weekdayLabelOf } from '@/lib/datetime';
import { prisma } from '@/lib/prisma';
import type { FixtureStatus, League } from '@/generated/prisma/client';

/** Tipp-Zelle im 34.TT-Raster: Tipp + berechnete Punkte (null = nicht bewertbar). */
export type TipCell = {
  tipHome: number | null;
  tipAway: number | null;
  points: 0 | 1 | 2 | 3 | null;
  /** true = Notfalltipp-Ersatzwert statt echtem Tipp (bei der Auswertung eingesetzt). */
  emergency: boolean;
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
 * Tagesspalte eines Tipptags: ein KALENDERTAG (key, z. B. „2026-01-13") mit
 * kompaktem Etikett. Welche Tage ein Tipptag hat, ergibt sich aus seinen
 * Anstößen — nicht aus einem festen Raster.
 *
 * Gruppiert wird nach Kalendertag, nicht nach Wochentag: ein Tipptag kann
 * mehrere Wochenenden bündeln (25/26 TT 1 = 2. Liga ST 1 + 2, weil die
 * Bundesliga noch nicht lief) oder Nachholspiele enthalten (TT 17 = ein
 * Mittwochsspiel sieben Wochen später). Zwei „Fr" sind dann zwei Tage.
 */
export type DayColumn = { key: string; label: string };
/** Punkte je Kalendertag, indiziert wie DayColumn.key. Fehlender Tag = keine Partie. */
export type DailyPoints = Record<string, number>;
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
 * Die Tagesspalten eines Tipptags: jeder bespielte Kalendertag genau einmal,
 * chronologisch.
 *
 * Etikett: der Wochentag allein („Fr") reicht, solange er im Tipptag eindeutig
 * ist — das trifft auf die üblichen Wochenend-Tipptage zu. Kommt derselbe
 * Wochentag mehrfach vor (zwei Wochenenden, Nachholspiel), trägt das Etikett
 * zusätzlich das Datum („Fr 08.08."), sonst wäre nicht erkennbar, welcher
 * Freitag gemeint ist.
 */
function dayColumnsOf(fixtures: { kickoff: Date }[]): DayColumn[] {
  // Je Kalendertag der früheste Anstoß — der bestimmt Reihenfolge und Etikett.
  const firstKickoff = new Map<string, Date>();
  for (const f of fixtures) {
    const key = dateKeyOf(f.kickoff);
    const known = firstKickoff.get(key);
    if (!known || f.kickoff < known) {
      firstKickoff.set(key, f.kickoff);
    }
  }
  const days = [...firstKickoff.entries()].sort((a, b) => a[1].getTime() - b[1].getTime());

  const weekdayUses = new Map<string, number>();
  for (const [, kickoff] of days) {
    const weekday = weekdayLabelOf(kickoff);
    weekdayUses.set(weekday, (weekdayUses.get(weekday) ?? 0) + 1);
  }

  return days.map(([key, kickoff]) => {
    const weekday = weekdayLabelOf(kickoff);
    const ambiguous = (weekdayUses.get(weekday) ?? 0) > 1;
    return { key, label: ambiguous ? `${weekday} ${formatDayMonth(kickoff)}` : weekday };
  });
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
  const [tipsByUser, emergencyRows, quotaLeft] = await Promise.all([
    loadTipsByUser(scored.map((f) => f.id)),
    prisma.emergencyTip.findMany({
      where: { userId: { in: tippers.map((t) => t.id) } },
      include: { teamRules: true },
    }),
    // Notfalltipp-Verbrauch: pro Halbserie (Hin 1–17, Rück 18–34) greift er nur
    // für den ERSTEN vollständig verpassten Tipptag. Dazu genügt zu prüfen, ob der
    // Tipper in früheren Tipptagen derselben Halbserie schon einen ganz ausgelassen hat.
    emergencyQuotaLeft(matchday, tippers.map((t) => t.id)),
  ]);
  const emergencyByUser = new Map<string, EmergencyConfig>(
    emergencyRows.map((e) => [
      e.userId,
      {
        defaultHome: e.defaultHome,
        defaultAway: e.defaultAway,
        rules: e.teamRules.map((r) => ({ id: r.id, teamName: r.teamName, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst })),
      },
    ]),
  );

  const days = dayColumnsOf(scored);

  const tipperRows: TipperRow[] = tippers.map((t) => {
    const userTips = tipsByUser.get(t.id);
    const tipsByFixture = new Map<string, TipCell>();
    let blPoints = 0;
    let l2Points = 0;
    const daily: DailyPoints = emptyDaily(days);
    const counts: HitCounts = { three: 0, two: 0, one: 0 };

    // Notfalltipp greift nur, wenn der Tipper den GESAMTEN Tipptag verpasst hat
    // (teilweise Getippte = nicht vergessen) und das Halbserien-Kontingent frei ist.
    const missedWholeDay = (userTips?.size ?? 0) === 0 && scored.length > 0 && quotaLeft.has(t.id);
    for (const f of scored) {
      const tip = userTips?.get(f.id);
      // Ohne echten Tipp: Notfalltipp-Ersatzwert (falls konfiguriert) — zählt
      // bei der Punkteberechnung wie ein Tipp, bleibt aber als Ersatz markiert.
      const emergency =
        !tip && missedWholeDay ? resolveEmergencyTip(emergencyByUser.get(t.id) ?? null, f.homeTeam, f.awayTeam) : null;
      const effective = tip ?? emergency;
      const tipHome = effective?.homeGoals ?? null;
      const tipAway = effective?.awayGoals ?? null;
      const points = f.result && effective ? scoreTip(f.result, effective) : null;
      tipsByFixture.set(f.id, { tipHome, tipAway, points, emergency: !tip && emergency !== null });

      if (points !== null) {
        if (f.league === 'BL') blPoints += points;
        else l2Points += points;
        daily[dateKeyOf(f.kickoff)] += points;
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


/** Tipptag-Grenze der Hinrunde (1–17 Hin-, 18–34 Rückrunde). */
const HINRUUNDE_MAX_TIPPTAG = 17;

/**
 * Tiper mit freiem Notfalltipp-Kontingent in der Halbserie des gegebenen Tipptags:
 * alle, die in keinem früheren Tipptag derselben Halbserie null Tipps hatten.
 */
async function emergencyQuotaLeft(
  matchday: NonNullable<Awaited<ReturnType<typeof getMatchdayAdmin>>>,
  userIds: string[],
): Promise<Set<string>> {
  const halfStart = matchday.number <= HINRUUNDE_MAX_TIPPTAG ? 1 : HINRUUNDE_MAX_TIPPTAG + 1;
  const earlier = await prisma.matchday.findMany({
    where: {
      competitionId: matchday.competitionId,
      number: { gte: halfStart, lt: matchday.number },
    },
    select: { id: true },
  });
  if (earlier.length === 0 || userIds.length === 0) {
    return new Set(userIds);
  }
  const tips = await prisma.tip.findMany({
    where: {
      userId: { in: userIds },
      fixture: { section: { matchdayId: { in: earlier.map((m) => m.id) } } },
    },
    select: { userId: true, fixture: { select: { section: { select: { matchdayId: true } } } } },
  });
  // userId -> Menge der Tipptage mit mind. einem Tipp. Ein Tipptag ohne Eintrag
  // = vollständig verpasst = Kontingent dieser Halbserie verbraucht.
  const daysTipped = new Map<string, Set<string>>();
  for (const tip of tips) {
    const matchdayId = tip.fixture.section.matchdayId;
    if (matchdayId === null) continue;
    const set = daysTipped.get(tip.userId) ?? new Set<string>();
    set.add(matchdayId);
    daysTipped.set(tip.userId, set);
  }
  const left = new Set<string>();
  for (const userId of userIds) {
    const tipped = daysTipped.get(userId);
    if (!tipped || tipped.size === earlier.length) {
      left.add(userId);
    }
  }
  return left;
}
