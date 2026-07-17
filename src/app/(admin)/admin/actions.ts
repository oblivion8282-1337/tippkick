'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { addFixture, createSeasonWithBundesliga, createTipptageBatch, deleteFixture } from '@/lib/admin';
import { recalcMatchdaySpan } from '@/lib/rounds';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { FIXTURE_STATUS_LABELS, MAX_GOALS, MAX_TEXT_LENGTH, ROLE_ADMIN, ROLE_USER, clampGoals } from '@/lib/constants';
import type { FixtureStatus, League } from '@/generated/prisma/client';

/** FormData-Feld als nicht-leerer, gekappter String (max. MAX_TEXT_LENGTH). */
function requireTextField(formData: FormData, name: string): string {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) {
    throw new Error(`${name} darf nicht leer sein`);
  }
  if (raw.length > MAX_TEXT_LENGTH) {
    throw new Error(`${name} zu lang (max. ${MAX_TEXT_LENGTH} Zeichen)`);
  }
  return raw;
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ungültiges Datum: ${value}`);
  }
  return date;
}

function parseLeague(raw: string): League | null {
  return raw === 'BL' ? 'BL' : raw === 'L2' ? 'L2' : null;
}

/** Wirft, wenn das Datum in der Vergangenheit liegt (Admin legt versehentlich alte Partien an). */
function requireFutureKickoff(value: string): Date {
  const date = parseDate(value);
  if (date.getTime() <= Date.now()) {
    throw new Error('Anstoß muss in der Zukunft liegen');
  }
  return date;
}

/** Wirft, wenn die Zahl NaN / ∞ / nicht ganzzahlig / < 1 ist. */
function parsePositiveInt(value: FormDataEntryValue | null, label: string): number {
  if (value === null) {
    throw new Error(`${label} fehlt`);
  }
  const s = String(value).trim();
  if (s === '') {
    throw new Error(`${label} fehlt`);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(`${label} muss eine positive ganze Zahl sein`);
  }
  return n;
}

/**
 * Legt eine einzelne Partie in einem bestehenden Spieltag (Sektion) an. Spieltag wird
 * über Wettbewerb + Liga + Nummer identifiziert (aus dem Formular).
 */
export async function addFixtureAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await addFixture({
    competitionId: String(formData.get('competitionId')),
    league: parseLeague(String(formData.get('league') ?? '')),
    number: parsePositiveInt(formData.get('number'), 'Spieltag-Nummer'),
    kickoff: requireFutureKickoff(String(formData.get('kickoff'))),
    homeTeam: requireTextField(formData, 'homeTeam'),
    awayTeam: requireTextField(formData, 'awayTeam'),
  });
  revalidatePath('/admin/spieltage');
}

export async function deleteFixtureAction(matchdayId: string, fixtureId: string): Promise<void> {
  await requireAdmin();
  await deleteFixture(fixtureId);
  revalidatePath(`/admin/matchdays/${matchdayId}`);
  revalidatePath('/admin/spieltage');
}

// ─── Saison-Verwaltung ────────────────────────────────────────────────────────

/** Legt eine neue Saison (+ Bundesliga-Wettbewerb) an und wählt sie im Admin aus. */
export async function createSeasonAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const result = await createSeasonWithBundesliga(requireTextField(formData, 'name'));
  revalidatePath('/admin/spieltage');
  redirect(`/admin/spieltage?season=${result.id}`);
}

// ─── Tipptag-Gruppierung (Spieltage → Tipptage) ───────────────────────────────

/**
 * Legt mehrere Tipptage auf einmal an (Anzahl aus dem Formular), fortlaufend ab der
 * höchsten existierenden Nummer + 1. Placeholder-Daten; Span/Deadline werden via
 * recalcMatchdaySpan gesetzt, sobald Spieltage zugeordnet werden.
 */
export async function createTipptagAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const competitionId = String(formData.get('competitionId'));
  await createTipptageBatch(competitionId, parsePositiveInt(formData.get('count'), 'Anzahl'));
  revalidatePath('/admin/spieltage');
}

/**
 * Weist einen Spieltag einem Tipptag zu (oder entfernt die Zuordnung, wenn
 * matchdayId leer). Start/Ende/Deadline beider beteiligten Tipptage werden (parallel)
 * neu berechnet. Ein Spieltag ist immer in höchstens einem Tipptag (0..1) und darf
 * nur in einen Tipptag seines eigenen Wettbewerbs wandern.
 */
export async function assignRoundAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const sectionId = String(formData.get('sectionId'));
  const matchdayRaw = String(formData.get('matchdayId') ?? '');
  const matchdayId = matchdayRaw === '' ? null : matchdayRaw;

  const section = await prisma.matchdaySection.findUnique({
    where: { id: sectionId },
    select: { competitionId: true, matchdayId: true },
  });
  if (!section) {
    revalidatePath('/admin/spieltage');
    return;
  }

  // Wettbewerb-Invariante: Spieltag darf nur in einen Tipptag seines Wettbewerbs.
  if (matchdayId) {
    const target = await prisma.matchday.findUnique({
      where: { id: matchdayId },
      select: { competitionId: true },
    });
    if (!target || target.competitionId !== section.competitionId) {
      revalidatePath('/admin/spieltage');
      return;
    }
  }

  const previousMatchdayId = section.matchdayId;
  if (matchdayId !== previousMatchdayId) {
    // Optimistic concurrency: Erwartung steht in der WHERE-Klausel.
    // 0 affected = ein konkurrierender Admin war schneller (no-op).
    const { count } = await prisma.matchdaySection.updateMany({
      where: { id: sectionId, matchdayId: previousMatchdayId },
      data: { matchdayId },
    });
    if (count === 1) {
      const recalcIds = [previousMatchdayId, matchdayId].filter((id): id is string => Boolean(id));
      await Promise.all(recalcIds.map((id) => recalcMatchdaySpan(id)));
    }
  }
  revalidatePath('/admin/spieltage');
}

// ─── Manuelle Ergebnis-Erfassung ──────────────────────────────────────────────

/** Wirft bei unbekanntem Status – kein Silent-Coerce zu 'SCHEDULED' mehr. */
function parseStatus(raw: FormDataEntryValue | null): FixtureStatus {
  if (raw === null) {
    throw new Error('Status fehlt');
  }
  const value = String(raw);
  if (value in FIXTURE_STATUS_LABELS) {
    return value as FixtureStatus;
  }
  throw new Error(`Unbekannter Status: ${value}`);
}

// ─── Tipper-Verwaltung ────────────────────────────────────────────────────────

/** Ändert die Rolle eines Nutzers (Tipper <-> Tippleitung). Schützt den letzten Admin. */
export async function setUserRoleAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const userId = String(formData.get('userId'));
  const roleRaw = String(formData.get('role') ?? '');
  if (roleRaw !== ROLE_ADMIN && roleRaw !== ROLE_USER) {
    throw new Error(`Ungültige Rolle: ${roleRaw}`);
  }
  const role: typeof ROLE_ADMIN | typeof ROLE_USER = roleRaw;
  if (userId === session.user.id) {
    return; // sich selbst nicht ändern
  }

  // Atomarer Schutz gegen TOCTOU-Lockout: target-lookup + count + update in einer TX.
  // Serializable-Isolation: zwei parallele Demotions können nicht beide passieren.
  await prisma.$transaction(
    async (tx) => {
      if (await lastAdminGuard(tx, userId)) {
        return;
      }
      await tx.user.update({ where: { id: userId }, data: { role } });
    },
    { isolationLevel: 'Serializable' },
  );
  revalidatePath('/admin');
}

/** Löscht einen Nutzer (mitsamt Tipps/Sessions). Schützt sich selbst + letzten Admin. */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const userId = String(formData.get('userId'));
  if (userId === session.user.id) {
    return;
  }

  // Atomarer Schutz: lookup + count + delete in einer TX. Serializable gegen TOCTOU.
  await prisma.$transaction(
    async (tx) => {
      if (await lastAdminGuard(tx, userId)) {
        return;
      }
      await tx.user.delete({ where: { id: userId } });
    },
    { isolationLevel: 'Serializable' },
  );
  revalidatePath('/admin');
}

/**
 * Shared guard: liefert true wenn der Schutz greift (User nicht da ODER letzter Admin).
 * SSOT – wird in setUserRoleAction + deleteUserAction in einer TX aufgerufen, damit
 * der "letzter Admin"-Schutz nicht durch parallele Demotions ausgehebelt werden kann.
 */
async function lastAdminGuard(tx: Pick<typeof prisma, 'user'>, userId: string): Promise<boolean> {
  const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) {
    return true; // nicht da → no-op
  }
  if (target.role !== ROLE_ADMIN) {
    return false; // kein Admin → kein Schutz noetig
  }
  const adminCount = await tx.user.count({ where: { role: ROLE_ADMIN } });
  return adminCount <= 1; // true = blocken
}

/**
 * Schaltet einen wartenden Nutzer frei. Nur sinnvoll, wenn der User seine E-Mail
 * bereits bestätigt hat – sonst kann er sich nie einloggen (better-auth
 * requireEmailVerification: true blockt).
 */
export async function approveUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get('userId'));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (!user) {
    return;
  }
  if (!user.emailVerified) {
    throw new Error('User hat die E-Mail noch nicht bestätigt – zuerst den Bestätigungs-Link anklicken lassen.');
  }
  await prisma.user.update({ where: { id: userId }, data: { approved: true } });
  revalidatePath('/admin');
}

/** Lehnt einen wartenden Nutzer ab (= löscht ihn, nur solange approved=false). */
export async function rejectUserAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const userId = String(formData.get('userId'));
  if (userId === session.user.id) {
    return;
  }
  await prisma.user.deleteMany({ where: { id: userId, approved: false } });
  revalidatePath('/admin');
}

/**
 * Parst ein Tipp-/Ergebnis-Feld. Leerer String (oder Whitespace) → null (Ergebnis löschen),
 * finite Ganzzahl im Bereich 0..99 → die Zahl, sonst null. Number("") ist 0 — daher explizit vorher prüfen.
 * Negative oder gebrochene Zahlen werden verworfen (keine silent-coercion zu 0).
 */
function parseGoalField(raw: FormDataEntryValue | null): number | null {
  if (raw === null) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (trimmed === '') {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_GOALS) {
    return null;
  }
  return n;
}

/**
 * Setzt das Ergebnis einer Partie manuell. Markiert die Partie als resultSource=MANUAL
 * (ein OpenLigaDB-Re-Sync überschreibt sie nicht) und übernimmt alle Ergebnis-Felder –
 * Halbzeitstand + syncedAt werden zurückgesetzt, damit MANUAL konsistent besitzt.
 *
 * Cross-field validation: FINISHED/CANCELLED/POSTPONED verlangen konsistente Goals
 * (FINISHED braucht beide, CANCELLED/POSTPONED dürfen keine haben).
 */
export async function saveResultAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const fixtureId = String(formData.get('fixtureId'));
  const status = parseStatus(formData.get('status'));
  const homeGoals = parseGoalField(formData.get('homeGoals'));
  const awayGoals = parseGoalField(formData.get('awayGoals'));

  // Status <-> Goals Konsistenz.
  if (status === 'FINISHED' && (homeGoals === null || awayGoals === null)) {
    throw new Error('FINISHED verlangt beide Tore');
  }
  if ((status === 'CANCELLED' || status === 'POSTPONED') && (homeGoals !== null || awayGoals !== null)) {
    throw new Error('CANCELLED/POSTPONED dürfen keine Tore haben');
  }

  await prisma.fixture.update({
    where: { id: fixtureId },
    data: {
      homeGoals,
      awayGoals,
      htHomeGoals: null,
      htAwayGoals: null,
      syncedAt: null,
      status,
      resultSource: 'MANUAL',
    },
  });
  // matchdayId wird für revalidate mitgereicht (falls vorhanden).
  const matchdayId = String(formData.get('matchdayId') ?? '');
  if (matchdayId) {
    revalidatePath(`/admin/matchdays/${matchdayId}`);
  }
  revalidatePath('/admin/spieltage');
}

/**
 * Zusatzpunkte (ZP) der Tippleitung pro Tipper + Tipptag speichern – das einzige
 * freie Eingabefeld der TW-Auswertung. 0..99, ein Wert pro (Tipptag, User).
 */
export async function saveBonusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchdayId = String(formData.get('matchdayId'));
  const userId = String(formData.get('userId'));
  const bonusPts = clampGoals(Number(formData.get('bonusPts')));

  await prisma.matchdayBonus.upsert({
    where: { matchdayId_userId: { matchdayId, userId } },
    update: { bonusPts },
    create: { matchdayId, userId, bonusPts },
  });
  revalidatePath(`/admin/matchdays/${matchdayId}/auswertung`);
}
