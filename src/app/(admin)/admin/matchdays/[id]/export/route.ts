import { requireAdmin } from '@/lib/session';
import { getMatchdayAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { buildMatchdayExcel } from '@/lib/excel/export-matchday';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const matchday = await getMatchdayAdmin(id);
  if (!matchday) {
    return new Response('Spieltag nicht gefunden', { status: 404 });
  }

  // Tipper (Rolle user), alphabetisch – entspricht der Vorlagen-Reihenfolge.
  const tippers = await prisma.user.findMany({
    where: { role: 'user' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const tips = await prisma.tip.findMany({
    where: { fixture: { matchdayId: id } },
    select: { userId: true, fixtureId: true, homeGoals: true, awayGoals: true },
  });
  const tipsByUser = new Map<string, Map<string, { homeGoals: number; awayGoals: number }>>();
  for (const tip of tips) {
    let perUser = tipsByUser.get(tip.userId);
    if (!perUser) {
      perUser = new Map();
      tipsByUser.set(tip.userId, perUser);
    }
    perUser.set(tip.fixtureId, { homeGoals: tip.homeGoals, awayGoals: tip.awayGoals });
  }

  const buffer = await buildMatchdayExcel({
    matchdayNumber: matchday.number,
    dateRange: formatDateRange(matchday.startDate, matchday.endDate),
    tippers,
    fixtures: matchday.fixtures.map((f) => ({
      id: f.id,
      league: f.league,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
    })),
    tipsByUser,
  });

  const filename = `${matchday.number}_TT_Tipps.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${fmt(start)} - ${fmt(end)}`;
}
