import 'dotenv/config';

import { prisma } from '../src/lib/prisma';
import { createSeasonWithBundesliga, createTipptageBatch, importSeasonFromOpenLigaDb } from '../src/lib/admin';
import { recalcMatchdaySpan } from '../src/lib/rounds';
import { createCredentialUser } from '../src/lib/tippers';
import { ROLE_USER } from '../src/lib/constants';
import {
  COL_AWAY,
  COL_HOME,
  FIRST_TIPPER_COL,
  SECTION_BLOCKS,
  SECTION_ROWS,
  TIPPER_BLOCK_WIDTH,
  TIPPER_NAME_ROW,
  normalizeName,
} from '../src/lib/excel/types';
import { MATCHDAY_COUNT, SEASON_NAME, intOf, readAuswertung, stringOf } from './lib/auswertungen';
import type { League } from '../src/generated/prisma/client';

/**
 * Importiert die abgeschlossene Saison 25/26 aus den Alt-Auswertungen
 * (`Vorlagen/Auswertungen/NN_TT_Auswertung.xlsx`) als Testdatensatz:
 * Saison + Tipptage + alle Tipper + deren Tipps.
 *
 * Ansetzungen, Anstoßzeiten und Ergebnisse kommen NICHT aus dem Excel, sondern über
 * den regulären OpenLigaDB-Import — die Excel-Tabellen kennen keine Uhrzeiten, und so
 * läuft der Testdatensatz durch denselben Pfad wie die Produktion. Das Excel liefert
 * nur: Tipptag→Liga-Spieltag-Zuordnung und die Tipps.
 *
 * Die Zusatzpunkte (ZP) der Alt-Auswertung werden bewusst NICHT importiert — sie
 * entfallen künftig. `verify-season-2526.ts` rechnet sie beim Vergleich aus dem
 * Excel-Sollwert heraus.
 *
 * Idempotent: mehrfacher Aufruf ändert nichts. Aufruf: `pnpm import:2526`.
 */

/** Passwort der Test-Tipper. Nur für den lokalen Testdatensatz. */
const TIPPER_PASSWORD = process.env.IMPORT_TIPPER_PASSWORD ?? 'demo1234';

const LEAGUE_BY_LABEL: Record<string, League> = { '1. Liga': 'BL', '2. Liga': 'L2' };

/**
 * Team-Namen der Alt-Auswertung → OpenLigaDB-Schreibweise, als normalizeName-Schlüssel
 * (Diakritika entfernt: „München" → „munchen"). Beide Schreibweisen zeigen auf denselben
 * Wert, damit Excel-Kurzform und API-Langform kollidieren.
 *
 * Steht bewusst HIER und nicht in `src/lib/constants.ts`: das Produkt sieht diese
 * Kurzformen nie — zur Laufzeit kommen die Teamnamen aus OpenLigaDB. Das ist
 * Wissen über eine archivierte Excel-Datei, kein Teil der App-Domäne.
 */
const TEAM_ALIASES: Record<string, string> = {
  bayernmunchen: 'bayern',
  fcbayernmunchen: 'bayern',
  bayerleverkusen: 'leverkusen',
  bayer04leverkusen: 'leverkusen',
  bormonchengladbach: 'gladbach',
  borussiamonchengladbach: 'gladbach',
  werderbremen: 'bremen',
  svwerderbremen: 'bremen',
  '1fcheidenheim': 'heidenheim',
  '1fcheidenheim1846': 'heidenheim',
  svelversberg: 'elversberg',
  sv07elversberg: 'elversberg',
  arminiabielefeld: 'bielefeld',
  dscarminiabielefeld: 'bielefeld',
  eintrbraunschweig: 'braunschweig',
  eintrachtbraunschweig: 'braunschweig',
};

/** Kanonischer Team-Schlüssel für den Abgleich Excel ↔ OpenLigaDB. */
function teamKey(name: string): string {
  const normalized = normalizeName(name);
  return TEAM_ALIASES[normalized] ?? normalized;
}

/**
 * E-Mail-Slug aus dem Tipper-Namen („kl.Schalke" → „klschalke@tippkick.local").
 *
 * Nutzt bewusst NICHT normalizeName: das ist ein Match-Schlüssel (ä → a), hier
 * wird eine Adresse erzeugt, und dafür ist die deutsche Umschrift richtig
 * („Bächli" → „baechli", nicht „bachli").
 */
function tipperEmail(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
  return `${slug}@tippkick.local`;
}

type ParsedTip = { tipperName: string; homeGoals: number; awayGoals: number };
type ParsedFixture = { homeTeam: string; awayTeam: string; tips: ParsedTip[] };
type ParsedSection = { league: League; number: number; fixtures: ParsedFixture[] };
type ParsedMatchday = { number: number; tipperNames: string[]; sections: ParsedSection[] };

/** Liest die Tipper-Spalten aus Zeile 3: ab Spalte M in 6er-Schritten, bis kein Name mehr kommt. */
function readTipperColumns(sheet: import('exceljs').Worksheet): { name: string; col: number }[] {
  const nameRow = sheet.getRow(TIPPER_NAME_ROW);
  const columns: { name: string; col: number }[] = [];
  for (let col = FIRST_TIPPER_COL; ; col += TIPPER_BLOCK_WIDTH) {
    const name = stringOf(nameRow.getCell(col + 1).value);
    if (!name) {
      return columns;
    }
    columns.push({ name, col });
  }
}

/** Liest eine Auswertungs-Datei (Blatt „N.TT"): Liga-Sektionen, Partien, Tipps. */
async function parseMatchday(matchdayNumber: number): Promise<ParsedMatchday> {
  const workbook = await readAuswertung(matchdayNumber);
  const sheet = workbook.worksheets.find((w) => w.name !== 'TW');
  if (!sheet) {
    throw new Error(`TT ${matchdayNumber}: kein TT-Blatt gefunden`);
  }

  const tipperCols = readTipperColumns(sheet);
  if (tipperCols.length === 0) {
    throw new Error(`TT ${matchdayNumber}: keine Tipper-Spalten gefunden`);
  }

  const sections = SECTION_BLOCKS.map(({ headerRow, firstRow }) => {
    const header = sheet.getRow(headerRow);
    const label = stringOf(header.getCell(COL_HOME).value);
    const league = label ? LEAGUE_BY_LABEL[label] : undefined;
    if (!league) {
      throw new Error(`TT ${matchdayNumber}: unbekanntes Liga-Label ${JSON.stringify(label)} in Zeile ${headerRow}`);
    }
    const numberLabel = stringOf(header.getCell(COL_AWAY).value);
    const match = numberLabel?.match(/^(\d+)\./);
    if (!match) {
      throw new Error(`TT ${matchdayNumber}: unlesbare Spieltag-Nummer ${JSON.stringify(numberLabel)}`);
    }

    const fixtures: ParsedFixture[] = [];
    for (let offset = 0; offset < SECTION_ROWS; offset++) {
      const row = sheet.getRow(firstRow + offset);
      const homeTeam = stringOf(row.getCell(COL_HOME).value);
      const awayTeam = stringOf(row.getCell(COL_AWAY).value);
      if (!homeTeam || !awayTeam) {
        continue;
      }
      const tips: ParsedTip[] = [];
      for (const { name, col } of tipperCols) {
        const homeGoals = intOf(row.getCell(col).value);
        const awayGoals = intOf(row.getCell(col + 2).value);
        // Kein Tipp abgegeben → keine Tipp-Zeile (0:0 wäre eine Falschaussage).
        if (homeGoals !== null && awayGoals !== null) {
          tips.push({ tipperName: name, homeGoals, awayGoals });
        }
      }
      fixtures.push({ homeTeam, awayTeam, tips });
    }
    return { league, number: Number.parseInt(match[1], 10), fixtures } satisfies ParsedSection;
  });

  return { number: matchdayNumber, tipperNames: tipperCols.map((c) => c.name), sections };
}

async function main() {
  // 1) Saison + Bundesliga-Wettbewerb.
  const season = await createSeasonWithBundesliga(SEASON_NAME);
  const competition = await prisma.competition.findFirst({
    where: { seasonId: season.id, key: 'BL' },
    select: { id: true },
  });
  if (!competition) {
    throw new Error('Bundesliga-Wettbewerb fehlt nach createSeasonWithBundesliga');
  }
  console.log(`Saison ${SEASON_NAME}: ${season.created ? 'angelegt' : 'existiert bereits'}`);

  // 2) Ansetzungen + Ergebnisse über den regulären Import-Pfad.
  const imported = await importSeasonFromOpenLigaDb(competition.id);
  if (!imported.ok) {
    throw new Error(`OpenLigaDB-Import fehlgeschlagen: ${imported.reason} ${imported.message ?? ''}`);
  }
  console.log(`OpenLigaDB: ${imported.sections} Spieltage neu, ${imported.fixtures} Partien neu`);

  // 3) Excel einlesen.
  const parsed: ParsedMatchday[] = [];
  for (let n = 1; n <= MATCHDAY_COUNT; n++) {
    parsed.push(await parseMatchday(n));
  }
  const tipperNames = [...new Set(parsed.flatMap((m) => m.tipperNames))].sort();
  console.log(`Excel: ${parsed.length} Tipptage, ${tipperNames.length} Tipper`);

  // 4) Tipptage anlegen + Liga-Spieltage zuordnen (= was der Admin sonst unter
  //    /admin/spieltage per Dropdown macht).
  await createTipptageBatch(competition.id, MATCHDAY_COUNT);
  const matchdays = await prisma.matchday.findMany({
    where: { competitionId: competition.id },
    select: { id: true, number: true },
  });
  const matchdayByNumber = new Map(matchdays.map((m) => [m.number, m.id]));

  for (const md of parsed) {
    const matchdayId = matchdayByNumber.get(md.number);
    if (!matchdayId) {
      throw new Error(`Tipptag ${md.number} fehlt`);
    }
    for (const section of md.sections) {
      const updated = await prisma.matchdaySection.updateMany({
        where: { competitionId: competition.id, league: section.league, number: section.number },
        data: { matchdayId },
      });
      if (updated.count !== 1) {
        throw new Error(`Sektion ${section.league} ${section.number} (TT ${md.number}): ${updated.count} Treffer`);
      }
    }
    await recalcMatchdaySpan(matchdayId);
  }
  console.log(
    `Tipptage: ${parsed.length} angelegt, ${parsed.length * SECTION_BLOCKS.length} Liga-Spieltage zugeordnet`,
  );

  // 5) Tipper anlegen.
  const tipperIds = new Map<string, string>();
  for (const name of tipperNames) {
    const { id } = await createCredentialUser({
      name,
      email: tipperEmail(name),
      password: TIPPER_PASSWORD,
      role: ROLE_USER,
    });
    tipperIds.set(name, id);
  }
  console.log(`Tipper: ${tipperIds.size} angelegt/vorhanden`);

  // 6) Tipps zuordnen. Partie-Identität: (Sektion, Heim-, Gast-Team) über den
  //    normalisierten Team-Schlüssel — die Excel-Namen sind Kurzformen.
  const dbFixtures = await prisma.fixture.findMany({
    where: { section: { competitionId: competition.id } },
    select: { id: true, homeTeam: true, awayTeam: true, section: { select: { league: true, number: true } } },
  });
  const fixtureKey = (league: League | null, number: number, home: string, away: string) =>
    `${league}|${number}|${teamKey(home)}|${teamKey(away)}`;
  const fixtureIndex = new Map(
    dbFixtures.map((f) => [fixtureKey(f.section.league, f.section.number, f.homeTeam, f.awayTeam), f.id]),
  );

  const tipRows: { userId: string; fixtureId: string; homeGoals: number; awayGoals: number }[] = [];
  for (const md of parsed) {
    for (const section of md.sections) {
      for (const fixture of section.fixtures) {
        const key = fixtureKey(section.league, section.number, fixture.homeTeam, fixture.awayTeam);
        const fixtureId = fixtureIndex.get(key);
        if (!fixtureId) {
          throw new Error(`TT ${md.number}: Partie ${fixture.homeTeam} : ${fixture.awayTeam} (${key}) nicht gefunden`);
        }
        for (const tip of fixture.tips) {
          const userId = tipperIds.get(tip.tipperName);
          if (!userId) {
            throw new Error(`Tipper ${tip.tipperName} fehlt`);
          }
          tipRows.push({ userId, fixtureId, homeGoals: tip.homeGoals, awayGoals: tip.awayGoals });
        }
      }
    }
  }
  const tips = await prisma.tip.createMany({ data: tipRows, skipDuplicates: true });
  console.log(`Tipps: ${tips.count} neu (${tipRows.length} im Excel)`);
  console.log(`\nFertig. Tipper-Login: <name>@tippkick.local / ${TIPPER_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
