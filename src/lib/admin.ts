import { prisma } from '@/lib/prisma';
import type { League } from '@/generated/prisma/client';

/** Setzt genau einen Spieltag aktiv (alle anderen inaktiv) – SSOT für "aktuell". */
export async function activateMatchday(matchdayId: string): Promise<void> {
  await prisma.$transaction([
    prisma.matchday.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.matchday.update({ where: { id: matchdayId }, data: { isActive: true } }),
  ]);
}

export async function createMatchday(input: {
  seasonName: string;
  number: number;
  startDate: Date;
  endDate: Date;
  deadlineAt: Date;
}): Promise<string> {
  const season = await prisma.season.upsert({
    where: { name: input.seasonName },
    update: {},
    create: { name: input.seasonName },
  });

  const matchday = await prisma.matchday.create({
    data: {
      seasonId: season.id,
      number: input.number,
      startDate: input.startDate,
      endDate: input.endDate,
      deadlineAt: input.deadlineAt,
    },
  });
  return matchday.id;
}

export async function updateMatchday(
  matchdayId: string,
  input: { number: number; startDate: Date; endDate: Date; deadlineAt: Date },
): Promise<void> {
  await prisma.matchday.update({
    where: { id: matchdayId },
    data: input,
  });
}

export async function addFixture(input: {
  matchdayId: string;
  league: League;
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
      season: true,
      fixtures: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { fixtures: true } },
    },
  });
}
