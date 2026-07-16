import { prisma } from '@/lib/prisma';
import { ROLE_ADMIN, ROLE_USER } from '@/lib/constants';
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
  tippersTipped: number; //Tipper, die ALLE Partien dieses Tipptags getippt haben
};

/**
 * Nächste offene Tipptage einer Saison (deadline > jetzt), competitions-übergreifend.
 * tippersTipped = Anzahl Tipper, die den Tipptag VOLLSTÄNDIG getippt haben (nicht
 * nur ≥1 Tipp).
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

  // Partien-Zahl je Tipptag + Section -> Matchday.
  const fixtureCountByMatchday = new Map<string, number>();
  const sectionToMatchday = new Map<string, string>();
  for (const md of matchdays) {
    fixtureCountByMatchday.set(
      md.id,
      md.sections.reduce((sum, s) => sum + s._count.fixtures, 0),
    );
    for (const s of md.sections) {
      sectionToMatchday.set(s.id, md.id);
    }
  }
  const tips = await prisma.tip.findMany({
    where: { fixture: { sectionId: { in: [...sectionToMatchday.keys()] } } },
    select: { userId: true, fixture: { select: { sectionId: true } } },
  });
  // Tippanzahl je (Matchday, User); vollständig = Tippanzahl == fixtureCount.
  const countsByMatchday = new Map<string, Map<string, number>>();
  for (const tip of tips) {
    const matchdayId = sectionToMatchday.get(tip.fixture.sectionId);
    if (!matchdayId) {
      continue;
    }
    const counts = countsByMatchday.get(matchdayId);
    if (counts) {
      counts.set(tip.userId, (counts.get(tip.userId) ?? 0) + 1);
    } else {
      countsByMatchday.set(matchdayId, new Map([[tip.userId, 1]]));
    }
  }

  return matchdays.map((md) => {
    const total = fixtureCountByMatchday.get(md.id) ?? 0;
    const counts = total > 0 ? countsByMatchday.get(md.id) : undefined;
    let complete = 0;
    if (counts) {
      for (const c of counts.values()) {
        if (c >= total) {
          complete++;
        }
      }
    }
    return {
      id: md.id,
      number: md.number,
      deadlineAt: md.deadlineAt,
      competitionKey: md.competition.key,
      competitionName: md.competition.name,
      fixtureCount: total,
      tippersTipped: complete,
    };
  });
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

export type TipptagProgress = { total: number; tippedByUser: Map<string, number> };

/**
 * Tipp-Fortschritt je User für einen Tipptag: Gesamtzahl der Partien + Map
 * userId -> Anzahl getippter Partien. Vollständig = Tippanzahl == total.
 */
export async function getTipptagProgress(matchdayId: string): Promise<TipptagProgress> {
  const sections = await prisma.matchdaySection.findMany({
    where: { matchdayId },
    select: { id: true, _count: { select: { fixtures: true } } },
  });
  const total = sections.reduce((sum, s) => sum + s._count.fixtures, 0);
  const sectionIds = sections.map((s) => s.id);
  const tips =
    total > 0
      ? await prisma.tip.findMany({
          where: { fixture: { sectionId: { in: sectionIds } } },
          select: { userId: true },
        })
      : [];
  const tippedByUser = new Map<string, number>();
  for (const tip of tips) {
    tippedByUser.set(tip.userId, (tippedByUser.get(tip.userId) ?? 0) + 1);
  }
  return { total, tippedByUser };
}
