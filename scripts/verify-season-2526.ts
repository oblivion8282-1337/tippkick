import 'dotenv/config';

import { prisma } from '../src/lib/prisma';
import { buildAuswertung } from '../src/lib/auswertung';
import { FIRST_TIPPER_COL } from '../src/lib/excel/types';
import { SEASON_NAME, numOf, readAuswertung, stringOf } from './lib/auswertungen';

/**
 * Rechnet die importierte Saison 25/26 gegen die Alt-Auswertungen gegen: für jeden
 * Tipptag wird die Online-Auswertung (buildAuswertung) mit dem TW-Blatt verglichen —
 * 1./2. Liga, Gesamt und die 3er/2er/1er-Zähler je Tipper.
 *
 * Das ist der Abnahmetest für die Punkte-Regel: das Excel ist die Referenz.
 *
 * Die TAGESAUFTEILUNG ist bewusst KEIN Vergleichskriterium mehr. Das Alt-Excel hat
 * nur vier feste Fächer (Fr/Sa/So/Mo) und faltet Tage zusammen, wenn ein Tipptag
 * mehr Spieltage hat — bei TT 17 (englische Woche, sechs Tage) landet der Freitag
 * in der „sa"-Zeile und der Donnerstag in der „mi"-Zeile, und die TW-Spaltenköpfe
 * lügen dazu. Statt diesen Fehler nachzubauen prüfen wir die Invariante, die immer
 * gelten MUSS: die Tagespunkte summieren sich auf die Gesamtpunkte.
 *
 * Aufruf: `pnpm verify:2526`.
 */

/**
 * Spalten im TW-Blatt (1-basiert). `zp` = die manuellen Zusatzpunkte der alten
 * Auswertung; sie stecken in TW-Ges drin und werden beim Vergleich abgezogen,
 * weil das Produkt sie nicht mehr kennt (Vereinsbeschluss: ZP entfallen).
 */
const TW = { name: 1, total: 14, bl: 15, l2: 16, three: 17, two: 18, one: 19, zp: 20 } as const;

/** Erste und letzte Tipper-Zeile im TW-Blatt (danach folgen Summe/Schnitt). */
const TW_FIRST_ROW = 2;
const TW_LAST_ROW = 33;

/** Zeilen der vier Tages-Fächer im Summenblock eines Tipper-Blocks (Blatt „N.TT"). */
const DAY_SLOT_ROWS = [31, 33, 35, 37];

type Expected = { total: number; bl: number; l2: number; three: number; two: number; one: number };

/**
 * Die vier Tages-Beschriftungen des Alt-Excels (Spalte M im Summenblock des
 * ersten Tipper-Blocks). Nur zur Anzeige — sie sind die Krücke, die wir ersetzen.
 */
async function readDaySlots(matchdayNumber: number): Promise<string[]> {
  const workbook = await readAuswertung(matchdayNumber);
  const sheet = workbook.worksheets.find((w) => w.name !== 'TW');
  if (!sheet) {
    return [];
  }
  return DAY_SLOT_ROWS.map((row) => stringOf(sheet.getRow(row).getCell(FIRST_TIPPER_COL).value) ?? '–');
}

/** Liest die Soll-Werte je Tipper aus dem TW-Blatt einer Auswertungs-Datei. */
async function readExpected(matchdayNumber: number): Promise<Map<string, Expected>> {
  const workbook = await readAuswertung(matchdayNumber);
  const sheet = workbook.getWorksheet('TW');
  if (!sheet) {
    throw new Error(`TT ${matchdayNumber}: TW-Blatt fehlt`);
  }
  const out = new Map<string, Expected>();
  for (let rowNumber = TW_FIRST_ROW; rowNumber <= TW_LAST_ROW; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = row.getCell(TW.name).value;
    if (typeof name !== 'string' || name.trim().length === 0) {
      continue;
    }
    const cell = (col: number) => numOf(row.getCell(col).value) ?? 0;
    out.set(name.trim(), {
      total: cell(TW.total) - cell(TW.zp),
      bl: cell(TW.bl),
      l2: cell(TW.l2),
      three: cell(TW.three),
      two: cell(TW.two),
      one: cell(TW.one),
    });
  }
  return out;
}

async function main() {
  const season = await prisma.season.findUnique({ where: { name: SEASON_NAME }, select: { id: true } });
  if (!season) {
    throw new Error(`Saison ${SEASON_NAME} fehlt — erst \`pnpm import:2526\` laufen lassen.`);
  }
  const matchdays = await prisma.matchday.findMany({
    where: { competition: { seasonId: season.id, key: 'BL' } },
    orderBy: { number: 'asc' },
    select: { id: true, number: true },
  });

  let checked = 0;
  const diffs: { matchday: number; tipper: string; field: keyof Expected; want: number; got: number }[] = [];
  const dayErrors: string[] = [];
  const dayReport: string[] = [];
  for (const md of matchdays) {
    const [view, expected] = await Promise.all([buildAuswertung(md.id), readExpected(md.number)]);
    if (!view) {
      throw new Error(`TT ${md.number}: keine Auswertung`);
    }

    // Tage, die wir aus den Anstößen ableiten, vs. die vier Fächer des Alt-Excels.
    const ourDays = view.days.map((d) => d.label).join('/');
    const excelSlots = (await readDaySlots(md.number)).join('/');
    dayReport.push(`  TT ${String(md.number).padStart(2)}: wir ${ourDays.padEnd(17)} | Excel-Fächer ${excelSlots}`);

    for (const tipper of view.tippers) {
      // Invariante: die Tagespunkte MÜSSEN die Gesamtpunkte ergeben. Genau das
      // konnte das Alt-Excel bei englischen Wochen nicht (Di/Mi/Do fielen raus).
      const daySum = view.days.reduce((sum, d) => sum + (tipper.daily[d.key] ?? 0), 0);
      if (daySum !== tipper.totalPoints) {
        dayErrors.push(`TT ${md.number} · ${tipper.name.trim()}: Tagessumme ${daySum} ≠ Gesamt ${tipper.totalPoints}`);
      }
    }

    for (const tipper of view.tippers) {
      const want = expected.get(tipper.name.trim());
      if (!want) {
        // Tipper, die es 25/26 nicht gab (z. B. Demo-User aus dem Seed) — nicht vergleichbar.
        continue;
      }
      const got: Expected = {
        total: tipper.totalPoints,
        bl: tipper.blPoints,
        l2: tipper.l2Points,
        three: tipper.counts.three,
        two: tipper.counts.two,
        one: tipper.counts.one,
      };
      for (const key of Object.keys(got) as (keyof Expected)[]) {
        if (got[key] !== want[key]) {
          diffs.push({ matchday: md.number, tipper: tipper.name.trim(), field: key, want: want[key], got: got[key] });
        }
      }
      checked++;
    }
  }

  console.log('Tagesspalten (aus den echten Anstößen abgeleitet):');
  console.log(dayReport.join('\n'));
  console.log();

  if (dayErrors.length > 0) {
    console.log(`✗ Invariante verletzt — Tagespunkte ≠ Gesamtpunkte (${dayErrors.length}×):`);
    for (const e of dayErrors.slice(0, 5)) {
      console.log('    ' + e);
    }
    process.exitCode = 1;
  } else {
    console.log('✓ Invariante hält: die Tagespunkte summieren sich überall auf die Gesamtpunkte.');
  }

  console.log(`\nVerglichen mit dem Excel: ${matchdays.length} Tipptage × Tipper = ${checked} Zeilen, je 6 Werte`);
  if (diffs.length === 0) {
    console.log('✓ Keine Abweichung — die Punkte-Regel reproduziert das Excel exakt.');
    return;
  }

  // Gruppiert nach Tipptag + Feld: zeigt Muster (systematische Regel-Abweichung)
  // statt vieler Einzelzeilen, die alle dieselbe Ursache haben.
  const byMatchday = new Map<number, Map<keyof Expected, number>>();
  for (const d of diffs) {
    const fields = byMatchday.get(d.matchday) ?? new Map<keyof Expected, number>();
    fields.set(d.field, (fields.get(d.field) ?? 0) + 1);
    byMatchday.set(d.matchday, fields);
  }
  console.log(`✗ ${diffs.length} Abweichungen in ${byMatchday.size} von ${matchdays.length} Tipptagen:\n`);
  for (const [matchday, fields] of [...byMatchday.entries()].sort((a, b) => a[0] - b[0])) {
    const summary = [...fields.entries()].map(([field, count]) => `${field}×${count}`).join(', ');
    console.log(`  TT ${matchday}: ${summary}`);
  }
  console.log('\n  Beispiele:');
  for (const d of diffs.slice(0, 8)) {
    console.log(`    TT ${d.matchday} · ${d.tipper} · ${d.field}: Excel ${d.want}, berechnet ${d.got}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
