import { prisma } from '@/lib/prisma';
import { isTippable, matchdaySectionsInclude } from '@/lib/matchdays';
import { MAX_GOALS, MIN_GOALS } from '@/lib/constants';

function normalizeGoals(value: number): number {
  return Math.min(MAX_GOALS, Math.max(MIN_GOALS, Number.isFinite(value) ? Math.trunc(value) : 0));
}

/** Spieltag + eigene Tipps (map fixtureId -> Tipp) für die Tipp-Maske. */
export async function getMyTips(userId: string, matchdayId: string) {
  const matchday = await prisma.matchday.findUnique({
    where: { id: matchdayId },
    include: {
      competition: true,
      ...matchdaySectionsInclude,
    },
  });
  if (!matchday) {
    return null;
  }

  const fixtureIds = matchday.sections.flatMap((s) => s.fixtures.map((f) => f.id));
  const tips = fixtureIds.length
    ? await prisma.tip.findMany({ where: { userId, fixtureId: { in: fixtureIds } } })
    : [];
  const tipsByFixture = new Map(tips.map((tip) => [tip.fixtureId, tip]));

  return { matchday, tipsByFixture };
}

/**
 * Speichert/überschreibt einen Tipp. SSOT-Erzwingung der Sicherheit:
 * - nur für den eingeloggten Nutzer (userId vom Server, nie vom Client vertraut)
 * - nur bis zur Deadline (server-seitig geprüft; über Section -> Matchday)
 * - Tore normiert auf 0..99
 */
export async function saveTip(params: {
  userId: string;
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
}): Promise<{ ok: true } | { ok: false; reason: 'deadline' | 'invalid' | 'unapproved' }> {
  const { userId, fixtureId } = params;
  const homeGoals = normalizeGoals(params.homeGoals);
  const awayGoals = normalizeGoals(params.awayGoals);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { approved: true } });
  if (!user?.approved) {
    return { ok: false, reason: 'unapproved' };
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: { section: { include: { matchday: true } } },
  });
  if (!fixture) {
    return { ok: false, reason: 'invalid' };
  }

  // Unzugeordnete Partie (Spieltag noch keinem Tipptag zugeordnet) → nicht tippbar.
  const matchday = fixture.section.matchday;
  if (!matchday) {
    return { ok: false, reason: 'invalid' };
  }

  // Deadline server-seitig erzwingen – das UI ist nur Anzeige.
  if (!isTippable(matchday.deadlineAt)) {
    return { ok: false, reason: 'deadline' };
  }

  await prisma.tip.upsert({
    where: { userId_fixtureId: { userId, fixtureId } },
    update: { homeGoals, awayGoals },
    create: { userId, fixtureId, homeGoals, awayGoals },
  });

  return { ok: true };
}