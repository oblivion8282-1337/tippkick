import ExcelJS from 'exceljs';

import type { AuswertungView, TipperRow } from '@/lib/auswertung';
import { COL_AWAY, COL_HOME, FIRST_TIPPER_COL, TIPPER_BLOCK_WIDTH, TIPPER_NAME_ROW } from '@/lib/excel/types';
import { dateKeyOf, weekdayLabelOf } from '@/lib/datetime';
import type { League } from '@/generated/prisma/client';

/**
 * Bundesliga-Auswertung als Excel — vollständig generiert, zwei Blätter:
 *
 *  - „N.TT"  Roh-Blatt: Partien, Ergebnisse, alle Tipps und die Punkte je Tipp.
 *            Zum Nachrechnen und Archivieren.
 *  - „TW"    Bericht: je Tipper die Tagespunkte, Liga-Splits, 3er/2er/1er und Gesamt.
 *
 * Gerendert aus der AuswertungView — derselben Quelle wie die Online-Auswertung.
 * Damit können Seite und Excel nicht auseinanderlaufen; es gibt keine zweite
 * Punkte-Rechnung, die man synchron halten müsste.
 *
 * Bewusst OHNE Vorlage und ohne Formeln:
 *  - Die Tipper-Spalten kommen aus der Datenbank. Die alte Vorlage hatte die 32
 *    Namen der Saison 25/26 fest eingetragen; wer nicht drinstand, fiel still aus
 *    dem Export.
 *  - Die Tagesspalten kommen aus den echten Anstößen (view.days) statt aus einem
 *    festen Fr/Sa/So/Mo-Raster.
 *  - Die Ergebnisse holt die Seite selbst aus OpenLigaDB und rechnet die Punkte.
 *    Die Formeln der Vorlage hätten nur nachgerechnet, was schon feststeht.
 */

/** Spalten des Master-Teils links (A..K), passend zur gewohnten Optik. */
const COL_WEEKDAY = 1; // A
const COL_RESULT_HOME = 5; // E
const COL_RESULT_SEP = 6; // F
const COL_RESULT_AWAY = 7; // G
const COL_COUNT_THREE = 9; // I
const COL_COUNT_TWO = 10; // J
const COL_COUNT_ONE = 11; // K

/** Erste Sektions-Kopfzeile; danach folgen die Partien direkt darunter. */
const FIRST_SECTION_HEADER_ROW = 5;
/** Leerzeilen zwischen dem Ende einer Sektion und der nächsten Kopfzeile. */
const SECTION_GAP_ROWS = 2;

/**
 * Farbschema aus der Original-Auswertung (indexierte Legacy-Farben der Alt-Vorlage,
 * hier als ARGB). SSOT für die Optik beider Blätter.
 */
const COLOR = {
  title: 'FFCCFFCC', // hellgrün — Titelzelle
  section: 'FFFFFF99', // hellgelb — Sektionskopf, Punkte-/Gesamt-Spalten
  result: 'FFCCFFFF', // hellcyan — Ergebnis-, Tages- und Treffer-Spalten
  winnerFill: 'FFFFC7CE', // rosa — Tagessieger (höchster Wert je Spalte)
  winnerFont: 'FF9C0006', // dunkelrot — Schrift des Tagessiegers
} as const;

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BOX: Partial<ExcelJS.Borders> = { top: THIN, bottom: THIN, left: THIN, right: THIN };

/** Baut die Auswertungs-Arbeitsmappe (Roh-Blatt + TW-Bericht). */
export async function buildAuswertungExcel(view: AuswertungView): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tippkick';
  workbook.created = new Date();

  // TW-Bericht zuerst — die Datei öffnet auf der Wochenwertung, wie im Original
  // (das erste Blatt ist beim Öffnen aktiv).
  addReportSheet(workbook, view);
  addRawSheet(workbook, view);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Blatt „N.TT": Partien + Ergebnis + je Tipper ein 6-Spalten-Block mit Tipp und Punkten. */
function addRawSheet(workbook: ExcelJS.Workbook, view: AuswertungView): void {
  const ws = workbook.addWorksheet(`${view.matchdayNumber}.TT`);
  const tippers = view.tippers;

  ws.getColumn(COL_WEEKDAY).width = 4;
  ws.getColumn(COL_HOME).width = 24;
  ws.getColumn(COL_AWAY).width = 24;
  for (const col of [COL_RESULT_HOME, COL_RESULT_AWAY, COL_COUNT_THREE, COL_COUNT_TWO, COL_COUNT_ONE]) {
    ws.getColumn(col).width = 5;
  }
  for (let i = 0; i < tippers.length; i++) {
    const start = tipperBlockStart(i);
    ws.getColumn(start).width = 4;
    ws.getColumn(start + 2).width = 4;
    ws.getColumn(start + 3).width = 5;
  }

  // Paarungs-/Ergebnis-Spalten (A..L) beim Rechts-Scrollen durch die 32 Tipper
  // stehen lassen — sonst sieht man nicht mehr, zu welcher Partie eine Spalte gehört.
  ws.views = [{ state: 'frozen', xSplit: FIRST_TIPPER_COL - 1, ySplit: 0 }];
  ws.getRow(1).height = 20;

  const title = ws.getCell(1, COL_HOME);
  title.value = `${view.matchdayNumber}.TT`;
  title.font = { bold: true, size: 16 };
  title.fill = fill(COLOR.title);
  ws.getCell(3, COL_HOME).value = view.dateRangeLabel;
  ws.getCell(3, COL_HOME).font = { bold: true, size: 10 };
  ws.getCell(TIPPER_NAME_ROW, COL_AWAY).value = 'Name:';
  ws.getCell(TIPPER_NAME_ROW, COL_AWAY).alignment = { horizontal: 'right' };

  for (let i = 0; i < tippers.length; i++) {
    const cell = ws.getCell(TIPPER_NAME_ROW, tipperBlockStart(i) + 1);
    cell.value = tippers[i].name;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center' };
    cell.fill = fill(COLOR.section);
  }

  let headerRow = FIRST_SECTION_HEADER_ROW;
  for (const section of view.sections) {
    writeSectionHeader(ws, headerRow, section.label, section.sectionNumber, tippers.length);

    section.fixtures.forEach((fixture, index) => {
      const row = headerRow + 1 + index;
      ws.getCell(row, COL_WEEKDAY).value = weekdayLabelOf(fixture.kickoff).toLowerCase();

      const home = ws.getCell(row, COL_HOME);
      home.value = fixture.homeTeam;
      home.border = BOX;
      const sep = ws.getCell(row, COL_HOME + 1);
      sep.value = ':';
      sep.border = BOX;
      sep.alignment = { horizontal: 'center' };
      const away = ws.getCell(row, COL_AWAY);
      away.value = fixture.awayTeam;
      away.border = BOX;

      for (const col of [COL_RESULT_HOME, COL_RESULT_SEP, COL_RESULT_AWAY]) {
        const c = ws.getCell(row, col);
        c.fill = fill(COLOR.result);
        c.border = BOX;
        c.alignment = { horizontal: 'center' };
      }
      if (fixture.scoreable) {
        ws.getCell(row, COL_RESULT_HOME).value = fixture.resultHome;
        ws.getCell(row, COL_RESULT_SEP).value = ':';
        ws.getCell(row, COL_RESULT_AWAY).value = fixture.resultAway;
      }

      const counts = { three: 0, two: 0, one: 0 };
      tippers.forEach((tipper, i) => {
        const cell = tipper.tipsByFixture.get(fixture.id);
        const start = tipperBlockStart(i);
        for (const off of [0, 1, 2]) {
          ws.getCell(row, start + off).border = BOX;
          ws.getCell(row, start + off).alignment = { horizontal: 'center' };
        }
        const pkt = ws.getCell(row, start + 3);
        pkt.fill = fill(COLOR.section);
        pkt.border = BOX;
        pkt.alignment = { horizontal: 'center' };
        if (cell?.tipHome !== null && cell?.tipHome !== undefined) {
          ws.getCell(row, start).value = cell.tipHome;
          ws.getCell(row, start + 1).value = ':';
          ws.getCell(row, start + 2).value = cell.tipAway;
        }
        if (cell?.points !== null && cell?.points !== undefined) {
          pkt.value = cell.points;
          if (cell.points === 3) counts.three++;
          else if (cell.points === 2) counts.two++;
          else if (cell.points === 1) counts.one++;
        }
      });

      // Wie viele Tipper haben diese Partie wie gut getroffen (= wie schwer war sie).
      for (const col of [COL_COUNT_THREE, COL_COUNT_TWO, COL_COUNT_ONE]) {
        const c = ws.getCell(row, col);
        c.fill = fill(COLOR.result);
        c.alignment = { horizontal: 'center' };
      }
      if (fixture.scoreable) {
        ws.getCell(row, COL_COUNT_THREE).value = counts.three;
        ws.getCell(row, COL_COUNT_TWO).value = counts.two;
        ws.getCell(row, COL_COUNT_ONE).value = counts.one;
      }
    });

    headerRow += 1 + section.fixtures.length + SECTION_GAP_ROWS;
  }

  addTipperSummaries(ws, view, headerRow);
}

/**
 * Kleine Wertungstabelle unter jedem Tipper-Block (wie im Original): je Tag die
 * Punkte getrennt nach 1./2. Liga, Tagessumme und laufender Gesamtstand, darunter
 * die „G"-Zeile mit den Liga-Summen.
 *
 *          1     2    Ges   Total
 *    Fr    3     0     3     3
 *    Sa    1     4     5     8
 *    G     4     4          13
 *
 * Die Tag-Zeilen folgen den echten Spieltagen (view.days) — dieselbe dynamische
 * Logik wie die Tagesspalten des TW-Blatts.
 */
function addTipperSummaries(ws: ExcelJS.Worksheet, view: AuswertungView, startRow: number): void {
  // Fixture → (Liga, Kalendertag): einmal aufbauen, dann pro Tipper wiederverwenden.
  const fixtureMeta = new Map<string, { league: League; dayKey: string }>();
  for (const section of view.sections) {
    for (const f of section.fixtures) {
      fixtureMeta.set(f.id, { league: section.league, dayKey: dateKeyOf(f.kickoff) });
    }
  }

  const headerRow = startRow;
  view.tippers.forEach((tipper, i) => {
    const start = tipperBlockStart(i);
    const labelCol = start;
    const blCol = start + 1;
    const l2Col = start + 2;
    const gesCol = start + 3;
    const totalCol = start + 4;

    // Punkte je Tag × Liga für diesen Tipper.
    const perDay = new Map<string, { bl: number; l2: number }>();
    for (const day of view.days) perDay.set(day.key, { bl: 0, l2: 0 });
    for (const [fixtureId, cell] of tipper.tipsByFixture) {
      if (cell.points === null) continue;
      const meta = fixtureMeta.get(fixtureId);
      if (!meta) continue;
      const bucket = perDay.get(meta.dayKey);
      if (bucket) bucket[meta.league === 'BL' ? 'bl' : 'l2'] += cell.points;
    }

    const put = (row: number, col: number, value: string | number) => {
      const c = ws.getCell(row, col);
      c.value = value;
      c.fill = fill(COLOR.section);
      c.alignment = { horizontal: 'center' };
    };
    put(headerRow, blCol, '1');
    put(headerRow, l2Col, '2');
    put(headerRow, gesCol, 'Ges');
    put(headerRow, totalCol, 'Total');

    let running = 0;
    view.days.forEach((day, d) => {
      const { bl, l2 } = perDay.get(day.key) ?? { bl: 0, l2: 0 };
      const ges = bl + l2;
      running += ges;
      const row = headerRow + 1 + d;
      put(row, labelCol, day.label);
      put(row, blCol, bl);
      put(row, l2Col, l2);
      put(row, gesCol, ges);
      put(row, totalCol, running);
    });

    const gRow = headerRow + 1 + view.days.length;
    put(gRow, labelCol, 'G');
    put(gRow, blCol, tipper.blPoints);
    put(gRow, l2Col, tipper.l2Points);
    put(gRow, gesCol, '');
    put(gRow, totalCol, tipper.totalPoints);
  });
}

/** Kopfzeile einer Liga-Sektion: „1. Liga | 9. Spieltag | Ergeb. | 3er 2er 1er | Tipp/Pkt je Tipper". */
function writeSectionHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  sectionNumber: number,
  tipperCount: number,
): void {
  // [Spalte, Text, Füllfarbe] — Liga/Punkte gelb, Ergebnis/Treffer cyan wie im Original.
  const cells: [number, string, string][] = [
    [COL_HOME, label, COLOR.section],
    [COL_HOME + 1, '', COLOR.section],
    [COL_AWAY, `${sectionNumber}. Spieltag`, COLOR.section],
    [COL_RESULT_HOME, 'Ergeb.', COLOR.result],
    [COL_RESULT_SEP, '', COLOR.result],
    [COL_RESULT_AWAY, '', COLOR.result],
    [COL_COUNT_THREE, '3er', COLOR.result],
    [COL_COUNT_TWO, '2er', COLOR.result],
    [COL_COUNT_ONE, '1er', COLOR.result],
  ];
  for (let i = 0; i < tipperCount; i++) {
    cells.push([tipperBlockStart(i), 'Tipp', COLOR.section], [tipperBlockStart(i) + 3, 'Pkt.', COLOR.section]);
  }
  for (const [col, value, bg] of cells) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = { bold: true };
    cell.fill = fill(bg);
    cell.alignment = { horizontal: 'center' };
  }
}

/** Blatt „TW": je Tipper eine Zeile — Tagespunkte, Liga-Splits, Treffer, Gesamt. */
function addReportSheet(workbook: ExcelJS.Workbook, view: AuswertungView): void {
  const ws = workbook.addWorksheet('TW');

  // Kopf: Tages- und Treffer-Spalten cyan, BL/2L/Gesamt gelb — wie im Original.
  const headers = ['Tipper', ...view.days.map((d) => d.label), 'TW-BL', 'TW-2L', '3er', '2er', '1er', 'TW-Ges'];
  const dayCount = view.days.length;
  const colColor = (col: number): string | null => {
    if (col === 1) return null; // Tipper-Name
    const i = col - 2; // 0-basiert ab erster Datenspalte
    if (i < dayCount) return COLOR.result; // Tages-Spalten
    const rest = i - dayCount; // 0=BL 1=2L 2=3er 3=2er 4=1er 5=Ges
    if (rest === 0 || rest === 1 || rest === 5) return COLOR.section; // BL, 2L, Ges
    return COLOR.result; // 3er/2er/1er
  };

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell, col) => {
    const c = colColor(col);
    if (c) cell.fill = fill(c);
  });

  const rowValues = (t: TipperRow) => [
    t.name,
    ...view.days.map((d) => t.daily[d.key] ?? 0),
    t.blPoints,
    t.l2Points,
    t.counts.three,
    t.counts.two,
    t.counts.one,
    t.totalPoints,
  ];
  for (const tipper of view.tippers) {
    ws.addRow(rowValues(tipper));
  }

  // Tagessieger: pro Wertungsspalte den (oder die) höchsten Wert unter den Tippern
  // rosa + dunkelrot markieren. Ersetzt die top-1-Regel der Alt-Vorlage; da der
  // Export statisch ist (keine Formeln), reicht die direkte Markierung.
  const firstDataRow = 2;
  const lastDataRow = firstDataRow + view.tippers.length - 1;
  for (let col = 2; col <= headers.length; col++) {
    let max = -Infinity;
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      const v = ws.getCell(r, col).value;
      if (typeof v === 'number' && v > max) max = v;
    }
    if (max <= 0) continue; // 0 ist kein „Sieg" — niemand markieren
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      const cell = ws.getCell(r, col);
      if (cell.value === max) {
        cell.fill = fill(COLOR.winnerFill);
        cell.font = { color: { argb: COLOR.winnerFont } };
      }
    }
  }

  const aggregate = (label: string, data: typeof view.totals) => [
    label,
    ...view.days.map((d) => data.daily[d.key] ?? 0),
    data.bl,
    data.l2,
    data.counts.three,
    data.counts.two,
    data.counts.one,
    data.total,
  ];
  ws.addRow([]);
  const sumRow = ws.addRow(aggregate('Summe', view.totals));
  sumRow.font = { bold: true };
  const avgRow = ws.addRow(aggregate('Ø', view.averages));
  avgRow.font = { bold: true };
  // Schnitt einheitlich mit zwei Nachkommastellen (Ø 2.5 → „2,50"), wie im Original.
  avgRow.eachCell((cell, col) => {
    if (col > 1) cell.numFmt = '0.00';
  });

  ws.getColumn(1).width = 16;
  for (let col = 2; col <= headers.length; col++) {
    // Tages-Etiketten tragen bei mehrdeutigen Wochentagen ein Datum („Fr 08.08.").
    ws.getColumn(col).width = Math.max(7, String(headers[col - 1]).length + 2);
    ws.getColumn(col).alignment = { horizontal: 'center' };
  }
  // Kopfzeile + Namensspalte beim Scrollen sichtbar lassen.
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

/** Startspalte des Tipper-Blocks Nr. i (0-basiert) — dasselbe Raster wie die Alt-Vorlage. */
function tipperBlockStart(index: number): number {
  return FIRST_TIPPER_COL + index * TIPPER_BLOCK_WIDTH;
}
