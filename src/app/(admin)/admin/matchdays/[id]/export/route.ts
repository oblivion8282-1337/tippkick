import { requireAdmin } from '@/lib/session';
import { getMatchdayAdmin } from '@/lib/admin';
import { buildAuswertung } from '@/lib/auswertung';
import { formatDateRange } from '@/lib/datetime';
import { TEMPLATE_EXPORT_KEYS } from '@/lib/constants';
import { loadTipsByUser } from '@/lib/tipps';
import { getEligibleTippers } from '@/lib/tippers';
import { buildMatchdayExcel, CL_COMPACT_LAYOUT } from '@/lib/excel/export-matchday';
import { buildAuswertungExcel } from '@/lib/excel/export-auswertung';

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

  const buffer = TEMPLATE_EXPORT_KEYS.has(matchday.competition.key)
    ? await buildBundesligaExport(id)
    : await buildGenericExport(matchday);
  if (!buffer) {
    return new Response('Spieltag nicht gefunden', { status: 404 });
  }

  // Saison + Wettbewerb in den Filename: 25/26 + TT 17 kollidieren sonst mit
  // 26/27 + TT 17 — und BL-TT 3 mit einem späteren CL-TT 3.
  // Auch Windows-verbotene Zeichen ersetzen (\, :, *, ?, ", <, >, |), damit der
  // Download-Dialog nicht crasht.
  const sanitize = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-');
  const filename = `${sanitize(matchday.competition.season.name)}_${matchday.competition.key}_${matchday.number}_TT_Auswertung.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

type MinimalMatchday = NonNullable<Awaited<ReturnType<typeof getMatchdayAdmin>>>;

/**
 * Bundesliga: Roh-Blatt + TW-Bericht, gerendert aus derselben AuswertungView wie
 * die Online-Auswertung. Tipper und Tagesspalten kommen damit aus der Datenbank.
 */
async function buildBundesligaExport(matchdayId: string): Promise<Buffer | null> {
  const view = await buildAuswertung(matchdayId);
  return view ? buildAuswertungExcel(view) : null;
}

/**
 * Andere Wettbewerbe (CL/DFB/EM/WM): generische Einzel-Sektion ohne Punkte.
 * buildAuswertung deckt sie nicht ab — es filtert auf Liga-Sektionen (BL/L2).
 */
async function buildGenericExport(matchday: MinimalMatchday): Promise<Buffer> {
  const fixtureIds = matchday.sections.flatMap((s) => s.fixtures.map((f) => f.id));
  const [tippers, tipsByUser] = await Promise.all([getEligibleTippers(), loadTipsByUser(fixtureIds)]);

  // Nur CL: (a) Tipper-Blöcke ohne einzigen Tipp weglassen — sonst stehen
  // zwischen den Spalten leere 6er-Blöcke (TT 2 26/27: 11 von 32) — und
  // (b) das kompakte Block-Layout mit eigener Namensspalte, erster Block in G.
  // Bewusst auf CL beschränkt; DFB/EM/WM und die BL-Vorlagen-Auswertung bleiben
  // unverändert (alle Tipper, klassisches M-Raster).
  const isCL = matchday.competition.key === 'CL';
  const tippedTippers = isCL ? tippers.filter((t) => (tipsByUser.get(t.id)?.size ?? 0) > 0) : tippers;

  return buildMatchdayExcel({
    title: `${matchday.competition.name} - ${matchday.number}. Tipptag`,
    dateRange: formatDateRange(matchday.startDate, matchday.endDate),
    tippers: tippedTippers,
    layout: isCL ? CL_COMPACT_LAYOUT : undefined,
    fixtures: matchday.sections
      .flatMap((s) => s.fixtures)
      .map((f) => ({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
    tipsByUser,
  });
}
