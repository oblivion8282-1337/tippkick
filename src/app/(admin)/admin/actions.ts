'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { activateMatchday, addFixture, createMatchday, deleteFixture, importFixturesFromOpenLigaDb } from '@/lib/admin';
import { requireAdmin } from '@/lib/session';

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ungültiges Datum: ${value}`);
  }
  return date;
}

export async function createMatchdayAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = await createMatchday({
    competitionId: String(formData.get('competitionId')),
    number: Number(formData.get('number')),
    startDate: parseDate(String(formData.get('startDate'))),
    endDate: parseDate(String(formData.get('endDate'))),
    deadlineAt: parseDate(String(formData.get('deadlineAt'))),
  });
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  redirect(`/admin/matchdays/${id}`);
}

export async function activateMatchdayAction(matchdayId: string): Promise<void> {
  await requireAdmin();
  await activateMatchday(matchdayId);
  revalidatePath('/admin');
  revalidatePath('/dashboard');
}

export async function addFixtureAction(matchdayId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  await addFixture({
    matchdayId,
    kickoff: parseDate(String(formData.get('kickoff'))),
    homeTeam: String(formData.get('homeTeam')).trim(),
    awayTeam: String(formData.get('awayTeam')).trim(),
  });
  revalidatePath(`/admin/matchdays/${matchdayId}`);
}

export async function deleteFixtureAction(matchdayId: string, fixtureId: string): Promise<void> {
  await requireAdmin();
  await deleteFixture(fixtureId);
  revalidatePath(`/admin/matchdays/${matchdayId}`);
}

/**
 * Importiert einen Spieltag aus OpenLigaDB. Gibt ein Ergebnis zurück, das die UI
 * auswerten kann (kein automatisches Redirect, damit Fehler sichtbar werden).
 */
export async function importFixturesAction(formData: FormData): Promise<{
  ok: boolean;
  message: string;
  matchdayId?: string;
}> {
  await requireAdmin();
  const competitionId = String(formData.get('competitionId'));
  const matchdayNumber = Number(formData.get('matchdayNumber'));

  const result = await importFixturesFromOpenLigaDb(competitionId, matchdayNumber);
  revalidatePath('/admin');
  revalidatePath('/dashboard');

  if (result.ok) {
    return { ok: true, message: `${result.count} Partien importiert.`, matchdayId: result.matchdayId };
  }
  const messages = {
    'no-source': 'Wettbewerb hat keine OpenLigaDB-Quelle.',
    empty: 'Keine Partien gefunden (Spieltag existiert noch nicht?).',
    error: 'Fehler beim Abruf.',
  } as const;
  return { ok: false, message: messages[result.reason] };
}
