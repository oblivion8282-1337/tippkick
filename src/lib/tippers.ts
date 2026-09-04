import { hashPassword } from 'better-auth/crypto';

import { prisma } from '@/lib/prisma';
import { type Role } from '@/lib/constants';
import type { Prisma } from '@/generated/prisma/client';

export type EligibleTipper = { id: string; name: string };

/**
 * Teilnahme-Filter (SSOT): wer zählt als Tipper. Freigeschaltet und nicht
 * gebannt — die ROLLE spielt bewusst keine Rolle (siehe getEligibleTippers).
 *
 * Als Funktion, nicht als Konstante: `banExpires < jetzt` muss zur Abfragezeit
 * ausgewertet werden, nicht beim Laden des Moduls.
 */
export function eligibleTipperWhere(): Prisma.UserWhereInput {
  return {
    approved: true,
    // Gebannte User ausschließen – ihre vor-ban-Tipps dürfen nicht in der
    // Auswertung landen. banExpires in der Vergangenheit = bereits entbannt.
    OR: [{ banned: false }, { banned: null }, { banExpires: { lt: new Date() } }],
  };
}

/**
 * Legt einen Nutzer mit Credential-Login an oder liefert den bestehenden
 * (Identität: E-Mail). SSOT für die better-auth-Account-Form — insbesondere
 * dafür, dass `accountId` die User-ID sein MUSS, sonst findet better-auth das
 * Passwort nicht. Genutzt von Seed und Alt-Saison-Import.
 *
 * Direkt angelegte Nutzer sind verifiziert + freigeschaltet: sie kommen nicht
 * über die Registrierung, es gibt also niemanden, der sie freischalten würde.
 */
export async function createCredentialUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    return { id: existing.id, created: false };
  }
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id,
      name: input.name,
      email: input.email,
      emailVerified: true,
      approved: true,
      role: input.role,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: id, // better-auth erwartet hier die User-ID
          providerId: 'credential',
          password: await hashPassword(input.password),
        },
      },
    },
  });
  return { id, created: true };
}

/**
 * Sortierung wie die Alt-Auswertungen: deutsche Alphabet-Regeln, Groß-/Klein-
 * schreibung egal („derHanseat" bei D, „kl.Schalke" bei K). Postgres' Standard-
 * Kollation sortiert Kleinbuchstaben hinter alle Großbuchstaben — deshalb
 * app-seitig mit Intl.Collator statt orderBy.
 */
const NAME_COLLATOR = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export function compareTipperNames(a: string | null, b: string | null): number {
  return NAME_COLLATOR.compare(a ?? '', b ?? '');
}

/**
 * Zur Auswertung zugelassene Tipper (SSOT): freigeschaltet und nicht gebannt.
 * Reihenfolge: deutsche, groß/klein-unabhängige Alphabet-Sortierung. Wird vom
 * Excel-Export UND der Online-Auswertung gemeinsam genutzt, damit beide
 * dieselben Zeilen/Reihenfolge liefern.
 *
 * BEWUSST OHNE Rollen-Filter: die Rolle sagt, was jemand DARF — nicht, ob er
 * mitspielt. Die Tippleitung ist im Verein selbst Tipper; ein eigenes
 * „Tippleitung"-Konto gibt es nicht. Filterte man hier auf Rolle 'user', fiele
 * ein Tipper in dem Moment aus Auswertung und Excel, in dem er Admin-Rechte
 * bekommt — samt seiner Tipps, still und ohne Fehlermeldung.
 */
export async function getEligibleTippers(): Promise<EligibleTipper[]> {
  const tippers = await prisma.user.findMany({
    where: eligibleTipperWhere(),
    select: { id: true, name: true },
  });
  return tippers.sort((a, b) => compareTipperNames(a.name, b.name));
}
