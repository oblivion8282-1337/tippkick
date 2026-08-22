'use server';

import { getSession, getUserGate } from '@/lib/session';
import { deleteTip, saveTip, type TipFailureReason } from '@/lib/tipps';

/**
 * Gate neben der Session: Server Actions laufen außerhalb des Layout-Schutzes,
 * daher müssen approved/banned hier frisch aus der DB geprüft werden.
 */
async function gateFailure(userId: string): Promise<TipFailureReason | null> {
  const gate = await getUserGate(userId);
  if (!gate?.approved) return 'unapproved';
  if (gate.banned) return 'banned';
  return null;
}

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
    const gate = await gateFailure(session.user.id);
    if (gate) {
      return { ok: false, reason: gate };
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

/** Löscht einen Tipp (beide Felder in der Maske geleert). Gleiche Checks wie save. */
export async function deleteTipAction(params: {
  fixtureId: string;
}): Promise<{ ok: true } | { ok: false; reason: TipFailureReason }> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, reason: 'unauth' };
    }
    const gate = await gateFailure(session.user.id);
    if (gate) {
      return { ok: false, reason: gate };
    }
    return await deleteTip({ userId: session.user.id, fixtureId: params.fixtureId });
  } catch {
    return { ok: false, reason: 'error' };
  }
}
