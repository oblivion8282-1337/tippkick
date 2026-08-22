'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

const MIN_GOALS = 0;
const MAX_GOALS = 99;

function parseGoals(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_GOALS || n > MAX_GOALS) {
    throw new Error('Ungültige Torzahl');
  }
  return n;
}

/** Notfalltipp-Grundregel speichern (legt EmergencyTip-Zeile bei Bedarf an). */
export async function saveEmergencyDefaultAction(formData: FormData): Promise<void> {
  const session = await requireUser();
  const defaultHome = parseGoals(formData.get('defaultHome'));
  const defaultAway = parseGoals(formData.get('defaultAway'));
  await prisma.emergencyTip.upsert({
    where: { userId: session.user.id },
    update: { defaultHome, defaultAway },
    create: { userId: session.user.id, defaultHome, defaultAway },
  });
  revalidatePath('/einstellungen');
}

/** Sonderregel hinzufügen (Mannschaft + Ergebnis). Einmal pro Mannschaft. */
export async function addEmergencyRuleAction(formData: FormData): Promise<void> {
  const session = await requireUser();
  const teamName = String(formData.get('teamName') ?? '').trim();
  const goalsFor = parseGoals(formData.get('goalsFor'));
  const goalsAgainst = parseGoals(formData.get('goalsAgainst'));
  if (!teamName || teamName.length > 100) {
    throw new Error('Ungültige Mannschaft');
  }
  const tip = await prisma.emergencyTip.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  });
  await prisma.emergencyTeamRule.upsert({
    where: { emergencyId_teamName: { emergencyId: tip.id, teamName } },
    update: { goalsFor, goalsAgainst },
    create: { emergencyId: tip.id, teamName, goalsFor, goalsAgainst },
  });
  revalidatePath('/einstellungen');
}

/** Sonderregel löschen — nur die eigene (ownership über Relation geprüft). */
export async function deleteEmergencyRuleAction(formData: FormData): Promise<void> {
  const session = await requireUser();
  const ruleId = String(formData.get('ruleId') ?? '');
  // where über verschachtelte Relation: löscht nur, wenn die Regel zum eigenen
  // Notfalltipp gehört — kein separater ownership-Check nötig.
  await prisma.emergencyTeamRule.deleteMany({
    where: { id: ruleId, emergency: { userId: session.user.id } },
  });
  revalidatePath('/einstellungen');
}
