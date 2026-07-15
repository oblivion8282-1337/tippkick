import { prisma } from '@/lib/prisma';

export type MatchdayWithFixtures = NonNullable<Awaited<ReturnType<typeof getActiveMatchday>>>;

/** Aktiver Spieltag inkl. Partien (sortiert wie auf dem Tippzettel). */
export async function getActiveMatchday() {
  return prisma.matchday.findFirst({
    where: { isActive: true },
    include: { season: true, fixtures: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function getMatchday(id: string) {
  return prisma.matchday.findUnique({
    where: { id },
    include: { season: true, fixtures: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** Alle Spieltage einer Saison (für Admin-Übersicht). */
export async function getMatchdays() {
  return prisma.matchday.findMany({
    orderBy: { number: 'asc' },
    include: { season: true, _count: { select: { fixtures: true } } },
  });
}

/**
 * Deadline-Logik (SSOT): Tipps sind nur bis zur Deadline möglich.
 * Wird server-seitig im Service erzwungen, UI zeigt nur den Zustand.
 */
export function isTippable(deadlineAt: Date): boolean {
  return new Date() < deadlineAt;
}
