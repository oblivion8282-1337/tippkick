'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { addFixture, createSeasonWithBundesliga, createTipptageBatch, deleteFixture } from '@/lib/admin';
import { recalcMatchdaySpan } from '@/lib/rounds';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { FIXTURE_STATUS_LABELS } from '@/lib/constants';
import type { FixtureStatus, League } from '@/generated/prisma/client';

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

/**
 * Legt eine einzelne Partie in einem bestehenden Spieltag (Sektion) an. Spieltag wird
 * über Wettbewerb + Liga + Nummer identifiziert (aus dem Formular).
 */
export async function addFixtureAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await addFixture({
    competitionId: String(formData.get('competitionId')),
    league: parseLeague(String(formData.get('league') ?? '')),
    number: Number(formData.get('number')),
    kickoff: parseDate(String(formData.get('kickoff'))),
    homeTeam: String(formData.get('homeTeam')).trim(),
    awayTeam: String(formData.get('awayTeam')).trim(),
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
  const result = await createSeasonWithBundesliga(String(formData.get('name')));
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
  await createTipptageBatch(competitionId, Number(formData.get('count')));
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
    return;
  }

  // Wettbewerb-Invariante: Spieltag darf nur in einen Tipptag seines Wettbewerbs.
  if (matchdayId) {
    const target = await prisma.matchday.findUnique({
      where: { id: matchdayId },
      select: { competitionId: true },
    });
    if (!target || target.competitionId !== section.competitionId) {
      return;
    }
  }

  const previousMatchdayId = section.matchdayId;
  if (matchdayId !== previousMatchdayId) {
    await prisma.matchdaySection.update({ where: { id: sectionId }, data: { matchdayId } });
    const recalcIds = [previousMatchdayId, matchdayId].filter((id): id is string => Boolean(id));
    await Promise.all(recalcIds.map((id) => recalcMatchdaySpan(id)));
  }
  revalidatePath('/admin/spieltage');
}

// ─── Manuelle Ergebnis-Erfassung ──────────────────────────────────────────────

function parseStatus(raw: string): FixtureStatus {
  return raw in FIXTURE_STATUS_LABELS ? (raw as FixtureStatus) : 'SCHEDULED';
}

/**
 * Setzt das Ergebnis einer Partie manuell. Markiert die Partie als resultSource=MANUAL
 * (ein OpenLigaDB-Re-Sync überschreibt sie nicht) und übernimmt alle Ergebnis-Felder –
 * Halbzeitstand + syncedAt werden zurückgesetzt, damit MANUAL konsistent besitzt.
 */
export async function saveResultAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const fixtureId = String(formData.get('fixtureId'));
  const homeGoals = Number(formData.get('homeGoals'));
  const awayGoals = Number(formData.get('awayGoals'));
  await prisma.fixture.update({
    where: { id: fixtureId },
    data: {
      homeGoals: Number.isFinite(homeGoals) ? homeGoals : null,
      awayGoals: Number.isFinite(awayGoals) ? awayGoals : null,
      htHomeGoals: null,
      htAwayGoals: null,
      syncedAt: null,
      status: parseStatus(String(formData.get('status'))),
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
