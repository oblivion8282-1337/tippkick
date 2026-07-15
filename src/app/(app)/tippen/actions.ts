'use server';

import { getSession } from '@/lib/session';
import { saveTip } from '@/lib/tipps';

/**
 * Server Action (Einstiegspunkt für die Tipp-Maske).
 * Holt die userId aus der Session – niemals vom Client vertraut – und reicht
 * an den Tippservice weiter. So lässt sich keine fremde userId einschleusen.
 */
export async function saveTipAction(params: {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
}): Promise<{ ok: true } | { ok: false; reason: 'unauth' | 'deadline' | 'invalid' }> {
  const session = await getSession();
  if (!session) {
    return { ok: false, reason: 'unauth' };
  }

  const result = await saveTip({
    userId: session.user.id,
    fixtureId: params.fixtureId,
    homeGoals: params.homeGoals,
    awayGoals: params.awayGoals,
  });

  return result;
}
