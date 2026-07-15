import { prisma } from '@/lib/prisma';

/**
 * Setzt genau einen Spieltag im zugehörigen Wettbewerb aktiv (andere im selben
 * Wettbewerb werden inaktiv) – SSOT für "aktueller Spieltag je Wettbewerb".
 */
export async function activateMatchday(matchdayId: string): Promise<void> {
  const matchday = await prisma.matchday.findUnique({ where: { id: matchdayId }, select: { competitionId: true } });
  if (!matchday) {
    return;
  }
  await prisma.$transaction([
    prisma.matchday.updateMany({
      where: { competitionId: matchday.competitionId, isActive: true },
      data: { isActive: false },
    }),
    prisma.matchday.update({ where: { id: matchdayId }, data: { isActive: true } }),
  ]);
}

export async function createMatchday(input: {
  competitionId: string;
  number: number;
  startDate: Date;
  endDate: Date;
  deadlineAt: Date;
}): Promise<string> {
  const matchday = await prisma.matchday.create({
    data: {
      competitionId: input.competitionId,
      number: input.number,
      startDate: input.startDate,
      endDate: input.endDate,
      deadlineAt: input.deadlineAt,
    },
  });
  return matchday.id;
}

export async function addFixture(input: {
  matchdayId: string;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
}): Promise<void> {
  const sortOrder = await prisma.fixture.count({ where: { matchdayId: input.matchdayId } });
  await prisma.fixture.create({ data: { ...input, sortOrder } });
}

export async function deleteFixture(fixtureId: string): Promise<void> {
  await prisma.fixture.delete({ where: { id: fixtureId } });
}

export async function getMatchdayAdmin(matchdayId: string) {
  return prisma.matchday.findUnique({
    where: { id: matchdayId },
    include: {
      competition: { include: { season: true } },
      fixtures: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { fixtures: true } },
    },
  });
}

/** Wettbewerbe der aktuellen Saison (Admin-Auswahl). */
export async function getCompetitionsAdmin() {
  const season = await prisma.season.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!season) {
    return [];
  }
  return prisma.competition.findMany({
    where: { seasonId: season.id },
    orderBy: { sortOrder: 'asc' },
  });
}
