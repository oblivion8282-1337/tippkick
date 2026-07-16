import { requireAdmin } from '@/lib/session';
import { getMatchdayAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { formatDateRange } from '@/lib/datetime';
import { ROLE_USER, TEMPLATE_EXPORT_KEYS } from '@/lib/constants';
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

  const isBundesliga = TEMPLATE_EXPORT_KEYS.has(matchday.competition.key);

  const result = isBundesliga
    ? await buildBundesligaExport(matchday, tippers)
    : await buildGenericExport(matchday, tippers);

  // Saison in den Filename: 25/26 + TT 17 kollidieren sonst mit 26/27 + TT 17.
  // Auch Windows-verbotene Zeichen ersetzen (\, :, *, ?, ", <, >, |), damit der
  // Download-Dialog nicht crasht.
  const seasonName = matchday.competition.season.name.replace(/[\\/:*?"<>|]/g, '-');
  const filename = `${seasonName}_${matchday.number}_TT_Tipps.xlsx`;
  const headers: Record<string, string> = {
    'Content-Type': XLSX_TYPE,
    'Content-Disposition': `attachment; filename="${filename}"`,
  };
  if (result.unmatchedTippers.length > 0) {
    // Sichtbares Signal an die Admin-Tools, falls welche ueber Browser/Download-Dialog
    // verschwindet (kein sichtbares UI in der Excel-Datei selbst).
    headers['X-Tippkick-Unmatched-Tippers'] = encodeURIComponent(result.unmatchedTippers.join(', '));
    // Noch einmal in den Server-Log (Admin sieht es im Konsolen-Output / Log-Aggregator).
    console.warn(
      `[export] ${result.unmatchedTippers.length} Tipper ohne Vorlagen-Spalte: ${result.unmatchedTippers.join(', ')}`,
    );
  }
  if (result.droppedSectionCount > 0) {
    headers['X-Tippkick-Dropped-Sections'] = String(result.droppedSectionCount);
  }
  return new Response(new Uint8Array(result.buffer), { headers });
}

type MinimalMatchday = Awaited<ReturnType<typeof getMatchdayAdmin>>;
type Tipper = { id: string; name: string };

export type ExportResult = { buffer: Buffer; unmatchedTippers: string[]; droppedSectionCount: number };

/** Bundesliga: vorlagenbasierter Export aus den Liga-Sektionen. */
async function buildBundesligaExport(matchday: NonNullable<MinimalMatchday>, tippers: Tipper[]): Promise<ExportResult> {
  const fixtureIds = matchday.sections.flatMap((s) => s.fixtures.map((f) => f.id));
  const tipsByUser = await loadTipsByUser(fixtureIds);

  const validSections = matchday.sections.filter(
    (s): s is typeof s & { league: NonNullable<typeof s.league> } => s.league !== null,
  );
  const droppedSectionCount = matchday.sections.length - validSections.length;
  if (droppedSectionCount > 0) {
    console.warn(
      `[export] Tipptag ${matchday.number} hat ${droppedSectionCount} Sektion(en) ohne Liga — werden im BL-Export uebersprungen.`,
    );
  }

  return buildBundesligaExcel({
    matchdayNumber: matchday.number,
    dateRange: formatDateRange(matchday.startDate, matchday.endDate),
    sections: validSections.map((s) => ({
      league: s.league,
      number: s.number,
      fixtures: s.fixtures.map((f) => ({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
    })),
    tippers,
    tipsByUser,
  });
}

/** Andere Wettbewerbe: generische Einzel-Sektion. */
async function buildGenericExport(matchday: NonNullable<MinimalMatchday>, tippers: Tipper[]): Promise<ExportResult> {
  const fixtureIds = matchday.sections.flatMap((s) => s.fixtures.map((f) => f.id));
  const tipsByUser = await loadTipsByUser(fixtureIds);
  const buffer = await buildMatchdayExcel({
    title: `${matchday.competition.name} - ${matchday.number}. Tipptag`,
    dateRange: formatDateRange(matchday.startDate, matchday.endDate),
    tippers,
    fixtures: matchday.sections
      .flatMap((s) => s.fixtures)
      .map((f) => ({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
    tipsByUser,
  });
  return { buffer, unmatchedTippers: [], droppedSectionCount: 0 };
}

/** Lädt Tipps für eine Fixture-Liste, gruppiert nach userId -> fixtureId -> tip. */
async function loadTipsByUser(
  fixtureIds: string[],
): Promise<Map<string, Map<string, { homeGoals: number; awayGoals: number }>>> {
  const tipsByUser = new Map<string, Map<string, { homeGoals: number; awayGoals: number }>>();
  if (fixtureIds.length === 0) {
    return tipsByUser;
  }
  const tips = await prisma.tip.findMany({
    where: { fixtureId: { in: fixtureIds } },
    select: { userId: true, fixtureId: true, homeGoals: true, awayGoals: true },
  });
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
