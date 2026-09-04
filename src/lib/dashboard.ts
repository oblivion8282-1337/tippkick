import { prisma } from '@/lib/prisma';
import { compareTipperNames } from '@/lib/tippers';
import { ROLE_ADMIN } from '@/lib/constants';
import { eligibleTipperWhere } from '@/lib/tippers';
import type { CompetitionKey, FixtureStatus, ResultSource } from '@/generated/prisma/client';

/** Wettbewerbe einer Saison mit Zählwerten (für die Wettbewerbe-Karte). */
export async function getCompetitionsOverview(seasonId: string) {
  return prisma.competition.findMany({
    where: { seasonId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { matchdays: true, sections: true } } },
  });
}

export type TipptagEntry = {
  id: string;
  number: number;
  deadlineAt: Date;
  label: string | null;
  competitionKey: CompetitionKey;
  competitionName: string;
};

/**
 * Tipptag-Chronik einer Saison, competitions-übergreifend, in drei Phasen:
 * - upcoming: Deadline in der Zukunft (früheste zuerst)
 * - running:  Deadline abgelaufen, aber noch Partien ohne Endergebnis (neueste zuerst)
 * - past:     alle Partien beendet/abgesagt — wirklich abgeschlossen (neueste zuerst)
 * Reine Metadaten — Tipp-Fortschritt und Partien liefert getMatchdayTipMatrix (SSOT).
 */
export async function getTipptagChronik(seasonId: string): Promise<{
  upcoming: TipptagEntry[];
  running: TipptagEntry[];
  past: TipptagEntry[];
}> {
  const matchdays = await prisma.matchday.findMany({
    where: { competition: { seasonId } },
    orderBy: { deadlineAt: 'desc' },
    include: {
      competition: { select: { key: true, name: true } },
      sections: { select: { fixtures: { select: { status: true } } } },
    },
  });
  const map = (md: (typeof matchdays)[number]): TipptagEntry => ({
    id: md.id,
    number: md.number,
    deadlineAt: md.deadlineAt,
    label: md.label ?? null,
    competitionKey: md.competition.key,
    competitionName: md.competition.name,
  });
  const now = Date.now();
  // Leere Platzhalter-Tipptage (z.B. DFB-Runden ohne Auslosung) tragen als
  // Deadline ihr Anlegedatum — sie sind weder offen noch abgeschlossen und
  // tauchen deshalb in der Chronik gar nicht auf.
  const real = matchdays.filter((md) => md.sections.some((s) => s.fixtures.length > 0));
  // „Erledigt“ = FINISHED oder CANCELLED (abgesagte Partien bekommen nie ein
  // Ergebnis und würden eine Auswertung sonst ewig blockieren).
  const settled = (md: (typeof matchdays)[number]) =>
    md.sections.every((s) => s.fixtures.every((f) => f.status === 'FINISHED' || f.status === 'CANCELLED'));
  const byDeadline = (md: (typeof matchdays)[number]) => md.deadlineAt.getTime() > now;
  const open = real.filter(byDeadline);
  const expired = real.filter((md) => !byDeadline(md));
  return {
    upcoming: open.reverse().map(map),
    running: expired.filter((md) => !settled(md)).map(map),
    past: expired.filter(settled).map(map),
  };
}

export type TipperStats = { total: number; tippers: number; admins: number };

/**
 * Tipper-Kennzahlen (für die Tipper-Karte). `tippers` zählt die Teilnehmer über
 * denselben Filter wie die Auswertung — nicht über die Rolle. Ein Tipper mit
 * Admin-Rechten ist beides und wird in beiden Zahlen mitgezählt.
 */
export async function getTipperStats(): Promise<TipperStats> {
  const [total, tippers, admins] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: eligibleTipperWhere() }),
    prisma.user.count({ where: { role: ROLE_ADMIN } }),
  ]);
  return { total, tippers, admins };
}

/** Alle Tipper namentlich (Tippleitung zuerst, dann Name) für die Tipper-Liste. */
export async function getTipperList() {
  const users = await prisma.user.findMany({
    orderBy: { role: 'asc' },
    select: { id: true, name: true, email: true, role: true, approved: true, emailVerified: true, image: true },
  });
  // Gleiche Reihenfolge wie die Auswertung (deutsch, Groß/Klein egal).
  return users.sort((a, b) => compareTipperNames(a.name, b.name));
}

export type TipMatrixFixture = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  status: FixtureStatus;
  resultSource: ResultSource;
  homeGoals: number | null;
  awayGoals: number | null;
};

export type MatchdayTipMatrix = {
  total: number;
  fixtures: TipMatrixFixture[];
  // userId -> (fixtureId -> Tipp-Werte). Einträge == getippte Partien.
  tipsByUser: Map<string, Map<string, { homeGoals: number; awayGoals: number }>>;
};

/**
 * Tipp-Matrix je User für einen Tipptag: geordnete Partien + Map
 * userId -> (fixtureId -> Tipp). Vollständig = Anzahl Einträge == total.
 * SSOT für die Deadline-Übersicht (sowohl „fertig?‟ als auch die Einzel-Tipps).
 */
export async function getMatchdayTipMatrix(matchdayId: string): Promise<MatchdayTipMatrix> {
  const all = await getMatchdayTipMatrices([matchdayId]);
  return all.get(matchdayId) ?? { total: 0, fixtures: [], tipsByUser: new Map() };
}

/**
 * Batch-Variante für Listen (Admin-Chronik): Matrizen für beliebig viele Tipptage
 * mit nur zwei Abfragen (Partien + Tipps) statt zwei pro Tipptag.
 */
export async function getMatchdayTipMatrices(matchdayIds: string[]): Promise<Map<string, MatchdayTipMatrix>> {
  const sections = await prisma.matchdaySection.findMany({
    where: { matchdayId: { in: matchdayIds } },
    select: {
      matchdayId: true,
      fixtures: {
        orderBy: [{ kickoff: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          homeTeam: true,
          awayTeam: true,
          kickoff: true,
          status: true,
          resultSource: true,
          homeGoals: true,
          awayGoals: true,
        },
      },
    },
  });
  const fixtureIds = sections.flatMap((s) => s.fixtures.map((f) => f.id));
  const tips = await prisma.tip.findMany({
    where: { fixtureId: { in: fixtureIds } },
    select: { fixtureId: true, userId: true, homeGoals: true, awayGoals: true },
  });
  const tipsByFixture = new Map<string, { userId: string; homeGoals: number; awayGoals: number }[]>();
  for (const t of tips) {
    const list = tipsByFixture.get(t.fixtureId) ?? [];
    list.push(t);
    tipsByFixture.set(t.fixtureId, list);
  }
  const result = new Map<string, MatchdayTipMatrix>();
  for (const id of matchdayIds) {
    const fixtures = sections.filter((s) => s.matchdayId === id).flatMap((s) => s.fixtures);
    const tipsByUser = new Map<string, Map<string, { homeGoals: number; awayGoals: number }>>();
    for (const f of fixtures) {
      for (const t of tipsByFixture.get(f.id) ?? []) {
        const byFixture = tipsByUser.get(t.userId) ?? new Map<string, { homeGoals: number; awayGoals: number }>();
        byFixture.set(f.id, { homeGoals: t.homeGoals, awayGoals: t.awayGoals });
        tipsByUser.set(t.userId, byFixture);
      }
    }
    result.set(id, { total: fixtures.length, fixtures, tipsByUser });
  }
  return result;
}
