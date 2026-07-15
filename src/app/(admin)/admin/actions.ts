'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { activateMatchday, addFixture, createMatchday, deleteFixture } from '@/lib/admin';
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
    seasonName: String(formData.get('seasonName')),
    number: Number(formData.get('number')),
    startDate: parseDate(String(formData.get('startDate'))),
    endDate: parseDate(String(formData.get('endDate'))),
    deadlineAt: parseDate(String(formData.get('deadlineAt'))),
  });
  revalidatePath('/admin');
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
  const league = String(formData.get('league')) === 'BL' ? 'BL' : 'L2';
  await addFixture({
    matchdayId,
    league,
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
