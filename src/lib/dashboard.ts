import { prisma } from '@/lib/prisma';
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
  fixtureCount: number;
  tippersTipped: number; //distincte Tipper mit ≥1 Tipp in diesem Tipptag
};

/**
 * Nächste offene Tipptage einer Saison (deadline > jetzt), competitions-übergreifend,
 * mit Tipp-Fortschritt (X distincte Tipper mit mind. einem Tipp).
 */
export async function getUpcomingTipptage(seasonId: string, limit = 6): Promise<UpcomingTipptag[]> {
  const matchdays = await prisma.matchday.findMany({
    where: { deadlineAt: { gt: new Date() }, competition: { seasonId } },
    orderBy: { deadlineAt: 'asc' },
    take: limit,
    include: {
      competition: { select: { key: true, name: true } },
      sections: { select: { id: true, _count: { select: { fixtures: true } } } },
    },
  });
  if (matchdays.length === 0) {
    return [];
  }

  // Section -> Matchday + distincte Tipper pro Matchday (≥1 Tipp).
  const sectionToMatchday = new Map<string, string>();
  for (const md of matchdays) {
    for (const s of md.sections) {
      sectionToMatchday.set(s.id, md.id);
    }
  }
  const tips = await prisma.tip.findMany({
    where: { fixture: { sectionId: { in: [...sectionToMatchday.keys()] } } },
    select: { userId: true, fixture: { select: { sectionId: true } } },
  });
  const usersByMatchday = new Map<string, Set<string>>();
  for (const tip of tips) {
    const matchdayId = sectionToMatchday.get(tip.fixture.sectionId);
    if (!matchdayId) {
      continue;
    }
    const set = usersByMatchday.get(matchdayId);
    if (set) {
      set.add(tip.userId);
    } else {
      usersByMatchday.set(matchdayId, new Set([tip.userId]));
    }
  }

  return matchdays.map((md) => ({
    id: md.id,
    number: md.number,
    deadlineAt: md.deadlineAt,
    competitionKey: md.competition.key,
    competitionName: md.competition.name,
    fixtureCount: md.sections.reduce((sum, s) => sum + s._count.fixtures, 0),
    tippersTipped: usersByMatchday.get(md.id)?.size ?? 0,
  }));
}

export type TipperStats = { total: number; tippers: number; admins: number };

/** Tipper-Kennzahlen (für die Tipper-Karte). */
export async function getTipperStats(): Promise<TipperStats> {
  const [total, tippers, admins] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'user' } }),
    prisma.user.count({ where: { role: 'admin' } }),
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

/** Distincte Tipper-IDs, die für einen Tipptag mind. einen Tipp abgegeben haben. */
export async function getTipptagTippers(matchdayId: string): Promise<Set<string>> {
  const tips = await prisma.tip.findMany({
    where: { fixture: { section: { matchdayId } } },
    distinct: ['userId'],
    select: { userId: true },
  });
  return new Set(tips.map((t) => t.userId));
}
