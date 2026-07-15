import { requireAdmin } from '@/lib/session';
import { getMatchdayAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { formatDateRange } from '@/lib/datetime';
import { TEMPLATE_EXPORT_KEYS } from '@/lib/constants';
import { buildMatchdayExcel } from '@/lib/excel/export-matchday';
import { buildBundesligaExcel } from '@/lib/excel/export-bundesliga';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const matchday = await getMatchdayAdmin(id);
  if (!matchday) {
    return new Response('Spieltag nicht gefunden', { status: 404 });
  }

  const tippers = await prisma.user.findMany({
    where: { role: 'user' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const isBundesliga = TEMPLATE_EXPORT_KEYS.has(matchday.competition.key);

  const buffer = isBundesliga
    ? await buildBundesligaExport(matchday, tippers)
    : await buildGenericExport(matchday, tippers);

  const filename = `${matchday.number}_TT_Tipps.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

type MinimalMatchday = Awaited<ReturnType<typeof getMatchdayAdmin>>;
type Tipper = { id: string; name: string };

/** Bundesliga: vorlagenbasierter Export aus dem einen (kombinierten) Spieltag. */
async function buildBundesligaExport(matchday: NonNullable<MinimalMatchday>, tippers: Tipper[]): Promise<Buffer> {
  const tipsByUser = await loadTipsByUser([matchday.id]);

  return buildBundesligaExcel({
    matchdayNumber: matchday.number,
    dateRange: formatDateRange(matchday.startDate, matchday.endDate),
    fixtures: matchday.fixtures.map((f) => ({
      id: f.id,
      league: f.league ?? 'BL',
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
    })),
    tippers,
    tipsByUser,
  });
}

/** Andere Wettbewerbe: generische Einzel-Sektion. */
async function buildGenericExport(matchday: NonNullable<MinimalMatchday>, tippers: Tipper[]): Promise<Buffer> {
  const tipsByUser = await loadTipsByUser([matchday.id]);
  return buildMatchdayExcel({
    title: `${matchday.competition.name} – ${matchday.number}. Spieltag`,
    dateRange: formatDateRange(matchday.startDate, matchday.endDate),
    tippers,
    fixtures: matchday.fixtures.map((f) => ({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
    tipsByUser,
  });
}

/** Lädt Tipps mehrerer Spieltage, gruppiert nach userId -> fixtureId -> tip. */
async function loadTipsByUser(
  matchdayIds: string[],
): Promise<Map<string, Map<string, { homeGoals: number; awayGoals: number }>>> {
  const tips = await prisma.tip.findMany({
    where: { fixture: { matchdayId: { in: matchdayIds } } },
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
  return tipsByUser;
}
