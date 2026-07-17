import { prisma } from '@/lib/prisma';
import { ROLE_ADMIN, ROLE_USER } from '@/lib/constants';
import { loadTipsByUser } from '@/lib/tipps';
import type { CompetitionKey } from '@/generated/prisma/client';

/** Wettbewerbe einer Saison mit Zählwerten (für die Wettbewerbe-Karte). */
export async function getCompetitionsOverview(seasonId: string) {
  return prisma.competition.findMany({
    where: { seasonId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { matchdays: true, sections: true } } },
  });
}

export type UpcomingTipptag = {
  id: string;
  number: number;
  deadlineAt: Date;
  competitionKey: CompetitionKey;
  competitionName: string;
};

/**
 * Nächste offene Tipptage einer Saison (deadline > jetzt), competitions-übergreifend.
 * Reine Metadaten — Tipp-Fortschritt und Partien liefert getMatchdayTipMatrix (SSOT).
 */
export async function getUpcomingTipptage(seasonId: string, limit = 6): Promise<UpcomingTipptag[]> {
  const matchdays = await prisma.matchday.findMany({
    where: { deadlineAt: { gt: new Date() }, competition: { seasonId } },
    orderBy: { deadlineAt: 'asc' },
    take: limit,
    include: { competition: { select: { key: true, name: true } } },
  });
  return matchdays.map((md) => ({
    id: md.id,
    number: md.number,
    deadlineAt: md.deadlineAt,
    competitionKey: md.competition.key,
    competitionName: md.competition.name,
  }));
}

export type TipperStats = { total: number; tippers: number; admins: number };

/** Tipper-Kennzahlen (für die Tipper-Karte). */
export async function getTipperStats(): Promise<TipperStats> {
  const [total, tippers, admins] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: ROLE_USER } }),
    prisma.user.count({ where: { role: ROLE_ADMIN } }),
  ]);
  return { total, tippers, admins };
}

/** Alle Tipper namentlich (Tippleitung zuerst, dann Name) für die Tipper-Liste. */
export async function getTipperList() {
  return prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, approved: true, emailVerified: true },
  });
}

export type TipMatrixFixture = { id: string; homeTeam: string; awayTeam: string; kickoff: Date };

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
  const sections = await prisma.matchdaySection.findMany({
    where: { matchdayId },
    select: {
      fixtures: {
        orderBy: [{ kickoff: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, homeTeam: true, awayTeam: true, kickoff: true },
      },
    },
  });
  const fixtures = sections.flatMap((s) => s.fixtures);
  const tipsByUser = await loadTipsByUser(fixtures.map((f) => f.id));
  return { total: fixtures.length, fixtures, tipsByUser };
}
