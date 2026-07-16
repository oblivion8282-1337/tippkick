'use server';

import { getSession } from '@/lib/session';
import { saveTip, type TipFailureReason } from '@/lib/tipps';

/**
 * Server Action (Einstiegspunkt für die Tipp-Maske).
 * Holt die userId aus der Session – niemals vom Client vertraut – und reicht
 * an den Tippservice weiter. So lässt sich keine fremde userId einschleusen.
 * Liefert alle Ablehnungsgründe differenziert, damit das UI die Meldung anzeigen kann.
 */
export async function saveTipAction(params: {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
}): Promise<{ ok: true } | { ok: false; reason: TipFailureReason }> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, reason: 'unauth' };
    }

    return await saveTip({
      userId: session.user.id,
      fixtureId: params.fixtureId,
      homeGoals: params.homeGoals,
      awayGoals: params.awayGoals,
    });
  } catch {
    // DB-/Prisma-Fehler werden hier abgefangen, damit die UI nicht in einer
    // 500-Falle landet (kein error.tsx im (app)-Segment vorhanden).
    return { ok: false, reason: 'error' };
  }
}
