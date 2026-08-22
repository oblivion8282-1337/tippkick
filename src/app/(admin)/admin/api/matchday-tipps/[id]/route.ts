import { NextResponse } from 'next/server';

import { ROLE_ADMIN } from '@/lib/constants';
import { getMatchdayTipMatrix, getTipperList } from '@/lib/dashboard';
import { getSession } from '@/lib/session';

/**
 * Tipper-Matrix eines Tipptags als JSON — wird beim Aufklappen einer Chronik-Zeile
 * nachgeladen, damit die Admin-Startseite nicht alle Tipps aller Tipptage rendert.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.user.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const [matrix, tippers] = await Promise.all([getMatchdayTipMatrix(id), getTipperList()]);
  const rows = tippers
    .filter((t) => t.approved)
    .map((t) => ({
      id: t.id,
      name: t.name,
      admin: t.role === ROLE_ADMIN,
      image: t.image,
      cnt: matrix.tipsByUser.get(t.id)?.size ?? 0,
      total: matrix.total,
      tips: Object.fromEntries(matrix.tipsByUser.get(t.id) ?? []),
    }));
  return NextResponse.json({ fixtures: matrix.fixtures, rows });
}
