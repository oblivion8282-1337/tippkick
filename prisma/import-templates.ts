import 'dotenv/config';
import path from 'node:path';
import XLSX from 'xlsx';

import { prisma } from '../src/lib/prisma';

/**
 * Importiert Bundesliga-Tipptage aus den Vereinsvorlagen (TT-Excel-Dateien).
 *
 * Verwendung:
 *   pnpm db:import-templates                          # Vorlagen/ (Standard-Pfad)
 *   pnpm db:import-templates -- --dir <pfad>          # anderer Ordner
 *
 * Erkennt pro <n>.TT.xlsx die Liga-Sektionen (1. Liga / 2. Liga) und ihre
 * Liga-Matchday-Nummern ("<n>. Spieltag") aus der jeweiligen Header-Zeile, liest
 * 9 Partien pro Sektion, legt für jede Sektion eine MatchdaySection an und
 * verknüpft sie mit einem Matchday (Tipprunde = <n>).
 *
 * Idempotent: bestehende Sektionen/Partien werden übersprungen.
 */

type ParsedFixture = { homeTeam: string; awayTeam: string };
type ParsedSection = {
  league: 'BL' | 'L2';
  number: number; // Liga-Matchday-Number
  fixtures: ParsedFixture[];
};
type ParsedTt = {
  ttNumber: number;
  seasonName: string;
  dateRange: string;
  sections: ParsedSection[];
};

const DEFAULT_DIR = path.resolve(process.cwd(), '..', 'Vorlagen', 'Tipptage_26_27');

function parseArgs(argv: string[]): { dir: string } {
  let dir = DEFAULT_DIR;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      dir = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return { dir };
}

function parseTtFile(filePath: string, fileNumber: number): ParsedTt | null {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    raw: true,
  });

  // Zeile 0: ["<n>.TT", null, null, "Saison YY/ZZ"] oder ["<n>.TT", null, null, "YY/ZZ"]
  // → Saison-Name ableiten.
  const header = rows[0] as unknown[];
  const seasonCell = header[3];
  if (typeof seasonCell !== 'string') {
    console.warn(`[skip] ${filePath}: Zeile 0 enthält keine Saison-Info.`);
    return null;
  }
  // "Saison 26/27" → "26/27"; "26/27" bleibt.
  const seasonName = seasonCell.replace(/^Saison\s+/i, '').trim();

  // Zeile 1: Datum-Range für Anstoßzeiten + Header-Struktur.
  const dateRow = rows[1] as unknown[];
  const dateRange = typeof dateRow[0] === 'string' ? dateRow[0].trim() : '';

  // Sektionen finden: Header-Zeilen beginnen mit "1. Liga" oder "2. Liga" in
  // Spalte A und enthalten "<n>. Spieltag" in Spalte C.
  const sections: ParsedSection[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const a = row[0];
    const c = row[2];
    if (typeof a !== 'string' || typeof c !== 'string') {
      continue;
    }
    const league = a === '1. Liga' ? ('BL' as const) : a === '2. Liga' ? ('L2' as const) : null;
    if (!league) {
      continue;
    }
    const match = c.match(/^(\d+)\.\s*Spieltag$/);
    if (!match) {
      continue;
    }

    // Partien sammeln: ab der nächsten Zeile, bis leer, Sektion-Header oder
    // Stop-Wort ("mail tippleitung", Footer).
    const fixtures: ParsedFixture[] = [];
    for (let j = i + 1; j < rows.length; j++) {
      const fr = rows[j] as unknown[];
      const fa = fr[0];
      const fc = fr[2];
      if (typeof fa !== 'string') {
        // leere Zeile oder Footer: ggf. Sektion zu Ende.
        // Wenn schon Partien gesammelt, brechen wir hier ab (saubererer Cut).
        if (fixtures.length > 0) {
          break;
        }
        continue;
      }
      if (fa === '1. Liga' || fa === '2. Liga' || fa.startsWith('mail') || fa.startsWith('per ')) {
        break;
      }
      if (typeof fc !== 'string' || fc.length === 0) {
        continue; // keine "Heim : Gast"-Zeile
      }
      fixtures.push({ homeTeam: fa.trim(), awayTeam: fc.trim() });
      if (fixtures.length >= 9) {
        // Eine Sektion = max. 9 Partien. Wir lassen das Slicing bewusst zu,
        // falls die Vorlage mal abweicht (Excel-Roundtrip kann zeilen verschieben).
        break;
      }
    }

    sections.push({ league, number: Number.parseInt(match[1], 10), fixtures });
  }

  return {
    ttNumber: fileNumber,
    seasonName,
    dateRange,
    sections,
  };
}

/**
 * Parst den Date-Range-String in 1-2 Wochenend-Datums-Slots.
 * "15.01. - 17.01." → [Date('2027-01-15')]
 * "07.-09.08./14.08.-16.08." → [Date('2026-08-07'), Date('2026-08-14')]
 * "08.01.-10.01./12.01.-14.01." → [Date('2027-01-08'), Date('2027-01-12')]
 * "28.08. - 30.08." → [Date('2026-08-28')]
 *
 * Wir nutzen hier nur das Datum (UTC), die Uhrzeit wird in buildDatetimes
 * gesetzt. Saisonjahr wird über den Monat entschieden (siehe seasonYearForMonth).
 */
function parseDateRange(range: string): { day: number; month: number }[] {
  // Split bei "/" → 1-2 Wochenend-Halbzeiten.
  const halves = range.split('/').map((h) => h.trim());
  const slots: { day: number; month: number }[] = [];
  for (const half of halves) {
    // Wir nehmen den Tag, der in der "von"-Position steht:
    //   "07.-09.08."      → dd₁ = "07", dd₂ = "09", mm = "08" → 07.08.
    //   "15.01. - 17.01." → "15", "01" und "17", "01" → 15.01.
    //   "28.08. - 30.08." → 28.08.
    // Strategie: ersten dd-Pattern (allein, ohne Monat dahinter), dann dahinter
    // nach Monat suchen. Oder: ersten Tag (dd) und nächsten Monat (mm) extrahieren.
    const head = half.match(/^(\d+)\.\s*(?:-\s*(\d+)\.)?\s*(\d+)\./);
    if (!head) {
      continue;
    }
    slots.push({ day: Number.parseInt(head[1], 10), month: Number.parseInt(head[3], 10) });
  }
  return slots;
}

/** Sommer-Hinrunde (Juli-Dezember) = Saison-Anfangsjahr; Winter-Rückrunde = Saison-Endjahr. */
function seasonYearForMonth(month: number, seasonStartYear: number): number {
  return month >= 7 ? seasonStartYear : seasonStartYear + 1;
}

function seasonStartYear(seasonName: string): number {
  // "26/27" → 2026; "2026/27" → 2026
  const first = seasonName.split('/')[0].trim();
  const n = Number.parseInt(first, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Saison-Name nicht parsbar: ${seasonName}`);
  }
  return n < 100 ? 2000 + n : n;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fs = await import('node:fs/promises');
  const entries = await fs.readdir(args.dir);
  const ttFiles = entries
    .filter((f) => /^\d+\.TT\.xlsx$/i.test(f))
    .sort((a, b) => {
      const an = Number.parseInt(a, 10);
      const bn = Number.parseInt(b, 10);
      return an - bn;
    });
  if (ttFiles.length === 0) {
    throw new Error(`Keine TT-Dateien in ${args.dir} gefunden.`);
  }

  let matchdays = 0;
  let sections = 0;
  let fixtures = 0;

  for (const fileName of ttFiles) {
    const ttNumber = Number.parseInt(fileName, 10);
    const filePath = path.join(args.dir, fileName);
    const parsed = parseTtFile(filePath, ttNumber);
    if (!parsed || parsed.sections.length === 0) {
      console.warn(`[skip] ${fileName}: keine Sektionen erkannt.`);
      continue;
    }

    // Saison anlegen falls nötig.
    const season = await prisma.season.upsert({
      where: { name: parsed.seasonName },
      update: {},
      create: { name: parsed.seasonName },
    });
    const startYear = seasonStartYear(parsed.seasonName);

    // Wettbewerb Bundesliga in dieser Saison (sourceShortcuts leer = kein Auto).
    const competition = await prisma.competition.upsert({
      where: { seasonId_key: { seasonId: season.id, key: 'BL' } },
      update: { sourceShortcuts: [] },
      create: {
        seasonId: season.id,
        key: 'BL',
        name: 'Bundesliga (1. + 2. Liga)',
        sortOrder: 0,
        sourceShortcuts: [],
      },
    });

    // Kickoffs aus Date-Range (eine Sektion bekommt einen Slot in der Reihenfolge
    // ihres Auftretens; bei nur einem Slot bekommen alle Sektionen den gleichen).
    const slots = parseDateRange(parsed.dateRange);

    const datesForSections = parsed.sections.map((_, idx) => slots[Math.min(idx, slots.length - 1)]);
    const kickoffs = datesForSections.map((d) => {
      const year = seasonYearForMonth(d.month, startYear);
      return new Date(Date.UTC(year, d.month - 1, d.day, 13, 30, 0)); // 15:30 MESZ = 13:30 UTC, hier vereinfacht
    });
    // Sa + So eines Wochenendes: Partien, die später kommen, schieben wir
    // pragmatisch weiter nach (Sa 15:30, So 15:30 abwechselnd).
    const finals = parsed.sections.map((section, idx) => {
      if (section.fixtures.length <= 9) {
        return kickoffs[idx];
      }
      return kickoffs[idx];
    });
    void finals; // (aktuell gleicher Kickoff; ausreichend für initiale Anlage)

    const minKickoff = new Date(Math.min(...kickoffs.map((k) => k.getTime())));
    const maxKickoff = new Date(Math.max(...kickoffs.map((k) => k.getTime())));
    const deadlineAt = new Date(minKickoff.getTime() - 60_000); // 1 Min vor frühestem Anstoß

    // Matchday (Tipprunde = TT-Nummer) idempotent.
    const matchday = await prisma.matchday.upsert({
      where: { competitionId_number: { competitionId: competition.id, number: parsed.ttNumber } },
      update: {
        startDate: minKickoff,
        endDate: maxKickoff,
        deadlineAt,
      },
      create: {
        competitionId: competition.id,
        number: parsed.ttNumber,
        startDate: minKickoff,
        endDate: maxKickoff,
        deadlineAt,
      },
    });
    matchdays += 1;

    // Sektionen + Fixtures idempotent.
    for (let sIdx = 0; sIdx < parsed.sections.length; sIdx++) {
      const section = parsed.sections[sIdx];
      const sectionKickoff = kickoffs[sIdx];

      const existingSection = await prisma.matchdaySection.findFirst({
        where: {
          matchdayId: matchday.id,
          league: section.league,
          number: section.number,
        },
        select: { id: true },
      });
      const sectionRow =
        existingSection ??
        (await prisma.matchdaySection.create({
          data: {
            matchdayId: matchday.id,
            league: section.league,
            number: section.number,
          },
        }));
      if (!existingSection) {
        sections += 1;
      }

      const existingFixtureCount = await prisma.fixture.count({ where: { sectionId: sectionRow.id } });
      if (existingFixtureCount === 0 && section.fixtures.length > 0) {
        await prisma.fixture.createMany({
          data: section.fixtures.map((f, sortOrder) => ({
            sectionId: sectionRow.id,
            league: section.league,
            kickoff: sectionKickoff,
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            sortOrder,
          })),
        });
        fixtures += section.fixtures.length;
      }
    }
  }

  console.log(
    `Import fertig: ${matchdays} Tipptage, ${sections} neue Sektionen, ${fixtures} neue Partien (aus ${ttFiles.length} Vorlagen).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });