import { hashPassword } from 'better-auth/crypto';

import { prisma } from '@/lib/prisma';
import { ROLE_USER, type Role } from '@/lib/constants';

export type EligibleTipper = { id: string; name: string };

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
 * Zur Auswertung zugelassene Tipper (SSOT): freigeschaltet, Rolle 'user', nicht
 * gebannt. Reihenfolge name asc. Wird vom Excel-Export UND der Online-Auswertung
 * gemeinsam genutzt, damit beide dieselben Zeilen/Reihenfolge liefern.
 */
export async function getEligibleTippers(): Promise<EligibleTipper[]> {
  return prisma.user.findMany({
    where: {
      role: ROLE_USER,
      approved: true,
      // Gebannte User ausschließen – ihre vor-ban-Tipps dürfen nicht in der
      // Auswertung landen. banExpires in der Vergangenheit = bereits entbannt.
      OR: [{ banned: false }, { banned: null }, { banExpires: { lt: new Date() } }],
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}
