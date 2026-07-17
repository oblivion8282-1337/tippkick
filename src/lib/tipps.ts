import { prisma } from '@/lib/prisma';
import { getUserGate } from '@/lib/session';
import { isTippable, matchdaySectionsInclude } from '@/lib/matchdays';
import { clampGoals } from '@/lib/constants';

function normalizeGoals(value: number): number {
  return clampGoals(value);
}

/** Vollständiger Grund-Typ – wird in saveTipAction (Superset) und im UI geteilt. */
export type TipFailureReason = 'unauth' | 'deadline' | 'invalid' | 'unapproved' | 'banned' | 'closed' | 'error';

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
  const tips = fixtureIds.length ? await prisma.tip.findMany({ where: { userId, fixtureId: { in: fixtureIds } } }) : [];
  const tipsByFixture = new Map(tips.map((tip) => [tip.fixtureId, tip]));

  return { matchday, tipsByFixture };
}

/** Tipps für eine Fixture-Liste, gruppiert nach userId -> fixtureId -> Tipp (SSOT). */
export async function loadTipsByUser(
  fixtureIds: string[],
): Promise<Map<string, Map<string, { homeGoals: number; awayGoals: number }>>> {
  const tipsByUser = new Map<string, Map<string, { homeGoals: number; awayGoals: number }>>();
  if (fixtureIds.length === 0) {
    return tipsByUser;
  }
  const tips = await prisma.tip.findMany({
    where: { fixtureId: { in: fixtureIds } },
    select: { userId: true, fixtureId: true, homeGoals: true, awayGoals: true },
  });
  for (const tip of tips) {
    let perUser = tipsByUser.get(tip.userId);
    if (!perUser) {
      perUser = new Map();
      tipsByUser.set(tip.userId, perUser);
    }
    perUser.set(tip.fixtureId, { homeGoals: tip.homeGoals, awayGoals: tip.awayGoals });
  }
  return tipsByUser;
}

/**
 * Speichert/überschreibt einen Tipp. SSOT-Erzwingung der Sicherheit:
 * - nur für den eingeloggten Nutzer (userId vom Server, nie vom Client vertraut)
 * - nur bis zur Deadline (server-seitig geprüft; über Section -> Matchday)
 * - Tore normiert auf 0..99
 * - User muss approved sein und darf nicht gebannt sein (frisch aus DB,
 *   die Session allein reicht nicht: better-auth cached den Wert)
 */
export async function saveTip(params: {
  userId: string;
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
}): Promise<{ ok: true } | { ok: false; reason: Exclude<TipFailureReason, 'unauth' | 'error'> }> {
  const { userId, fixtureId } = params;
  const homeGoals = normalizeGoals(params.homeGoals);
  const awayGoals = normalizeGoals(params.awayGoals);

  const user = await getUserGate(userId);
  if (!user?.approved) {
    return { ok: false, reason: 'unapproved' };
  }
  if (user.banned) {
    return { ok: false, reason: 'banned' };
  }

  // Atomarer Schreib-Pfad: Status + Deadline werden IN der TX frisch gelesen
  // (nicht aus einem Cache-Fixture). Damit kann ein Tip nicht über die
  // Deadline-Grenze hinweg persistiert werden, und CANCELLED/POSTPONED sind hart gesperrt.
  return prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: fixtureId },
      select: {
        status: true,
        section: { select: { matchday: { select: { deadlineAt: true } } } },
      },
    });
    if (!fixture?.section.matchday) {
      return { ok: false, reason: 'invalid' as const };
    }
    if (fixture.status === 'CANCELLED' || fixture.status === 'POSTPONED') {
      return { ok: false, reason: 'closed' as const };
    }
    if (!isTippable(fixture.section.matchday.deadlineAt)) {
      return { ok: false, reason: 'deadline' as const };
    }

    await tx.tip.upsert({
      where: { userId_fixtureId: { userId, fixtureId } },
      update: { homeGoals, awayGoals },
      create: { userId, fixtureId, homeGoals, awayGoals },
    });
    return { ok: true as const };
  });
}
