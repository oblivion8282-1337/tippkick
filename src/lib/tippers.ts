import { prisma } from '@/lib/prisma';
import { ROLE_USER } from '@/lib/constants';

export type EligibleTipper = { id: string; name: string };

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
