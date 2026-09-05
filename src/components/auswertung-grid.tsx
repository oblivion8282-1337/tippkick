import { FIXTURE_STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { AuswertungView, TipCell } from '@/lib/auswertung';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Sticky-Master-Spalte: nur Position — Hintergrund und z-Index setzt jede Zelle selbst.
 * Wichtig: der Hintergrund einer Sticky-Zelle MUSS deckend sein, sonst schimmern die
 * darunter durchscrollenden Tipper-Spalten durch. Zwei Hintergrund-Utilities auf
 * derselben Zelle (z. B. `bg-card` + `bg-pitch/5`) haben gleiche Spezifität — es
 * gewinnt die zuletzt generierte, also die transparente Tönung.
 */
const MASTER_STICKY = 'sticky left-0';

const PILL_BASE = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

/** Status-Pill je Spiel-Stand: farbcodiert — läuft gefüllt grün, beendet grün
    umrandet, geplant grau, abgesagt rot, verlegt amber. */
function StatusPill({ status }: { status: keyof typeof FIXTURE_STATUS_LABELS }) {
  const styles: Record<keyof typeof FIXTURE_STATUS_LABELS, string> = {
    IN_PROGRESS: 'bg-pitch/20 text-pitch font-semibold',
    FINISHED: 'border border-pitch/50 text-pitch',
    SCHEDULED: 'bg-muted text-muted-foreground',
    CANCELLED: 'bg-destructive/15 text-destructive',
    POSTPONED: 'bg-amber-500/15 text-amber-600',
  };
  return <span className={cn(PILL_BASE, styles[status])}>{FIXTURE_STATUS_LABELS[status]}</span>;
}

/**
 * Punkte-Skala des 6-Spalten-Blocks: Textfarbe der Punktzahl + Flächenfüllung
 * (Volltreffer am kräftigsten).
 *
 * `bg` = Endergebnis — steht fest, trägt die Farbe.
 * `bgLive` = Zwischenstand einer laufenden Partie — dieselbe Farbe, aber bewusst
 * nur angedeutet: die Zahl selbst ist die Information, die Fläche soll im dichten
 * Raster nicht irritieren. Die Punkte können sich bis zum Abpfiff noch ändern.
 */
const POINTS_STYLE = {
  1: { text: 'text-amber-600', bg: 'bg-amber-500/10', bgLive: 'bg-amber-500/3' },
  2: { text: 'text-emerald-600', bg: 'bg-pitch/10', bgLive: 'bg-pitch/3' },
  3: { text: 'text-primary font-semibold', bg: 'bg-pitch/25', bgLive: 'bg-pitch/5' },
} as const;

/** Stil-Eintrag für einen Punktwert; 0 und „nicht bewertbar" haben keinen. */
function pointsStyle(points: TipCell['points'] | undefined) {
  return points === 1 || points === 2 || points === 3 ? POINTS_STYLE[points] : null;
}

function pointsClass(points: TipCell['points'] | undefined): string {
  return pointsStyle(points)?.text ?? 'text-muted-foreground/60';
}

/** Heatmap-Füllung des Blocks; `live` = vorläufige Punkte, daher blasser. */
function pointsBg(points: TipCell['points'] | undefined, live: boolean): string {
  const style = pointsStyle(points);
  if (!style) return '';
  return live ? style.bgLive : style.bg;
}

/**
 * TT-Raster: Partien als Zeilen, pro Tipper ein originalgetreuer 6-Spalten-Block
 * (Tipp-Heim | : | Tipp-Gast | Pkt | 3er | 2er). Ergebnis aus Fixture, Punkte berechnet.
 */
export function AuswertungGrid({ view }: { view: AuswertungView }) {
  // Legende nur zeigen, wenn gerade wirklich etwas läuft — sonst ist sie nur Rauschen.
  const hasLive = view.sections.some((s) => s.fixtures.some((f) => f.provisional));

  return (
    <Card>
      <CardHeader className="border-border/40 border-b">
        <CardTitle>{view.matchdayNumber}.TT — Tipps &amp; Punkte</CardTitle>
        {hasLive && (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="bg-pitch/25 inline-block h-3.5 w-4 shrink-0 rounded-sm" aria-hidden="true" />
            <span className="bg-pitch/5 -ml-1 inline-block h-3.5 w-4 shrink-0 rounded-sm" aria-hidden="true" />
            Schwach hinterlegt = Zwischenstand einer laufenden Partie. Diese Punkte können sich bis zum Abpfiff noch
            ändern und zählen noch nicht in die Summen.
          </p>
        )}
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {/* Pro Sektion ein eigener Scroll-Container (beide Achsen): 1. und 2. Liga
            scrollen horizontal UNABHAENGIG voneinander, Kopfzeilen (Liga + Tipper-
            Namen) bleiben beim Vertikalscrollen fixiert, die Master-Spalte beim Horizontalen.
            border-separate statt border-collapse: bei border-collapse werden Zellrahmen/
            -hintergründe vom Tabellen-Rendering übernommen statt pro Zelle isoliert — das
            kollidiert mit position: sticky und lässt durchscrollende Spalten unter der
            fixierten Master-Spalte durchschimmern. */}
        {view.sections.map((section) => (
          <div key={section.id} className="max-h-[75vh] overflow-auto">
            <table
              className="border-border/40 w-full border-y text-sm"
              style={{ borderCollapse: 'separate', borderSpacing: 0 }}
            >
              <thead className="sticky top-0 z-20">
                <tr>
                  {/* Titel in 2 Zellen: die linke klebt sticky am Rand (wie die
                      Master-Spalte), der Rest scrollt leer mit — die Liga-Kennung
                      bleibt beim horizontalen Scrollen sichtbar. */}
                  <th
                    colSpan={2}
                    className="bg-muted border-border/40 font-display sticky left-0 z-30 px-4 py-2 text-left text-base font-semibold"
                  >
                    {section.label} ·{' '}
                    <span className="text-muted-foreground font-normal">{section.sectionNumber}. Spieltag</span>
                  </th>
                  <th colSpan={view.tippers.length * 6} className="bg-muted" aria-hidden="true"></th>
                </tr>
                <tr className="bg-card text-xs">
                  <th className={`${MASTER_STICKY} bg-card z-30 px-4 py-2 text-left`}>Partie · Erg.</th>
                  <th className="bg-card px-2 py-2 text-left font-medium">Status</th>
                  {view.tippers.map((t) => (
                    <th
                      key={t.id}
                      colSpan={6}
                      className="bg-card border-border/40 border-l px-2 py-1 text-center font-medium"
                    >
                      {t.name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-card text-muted-foreground text-[10px] uppercase">
                  <th className={`${MASTER_STICKY} bg-card z-30 px-4 py-1`}></th>
                  <th className="bg-card px-2 py-1"></th>
                  {view.tippers.map((t) => (
                    <SubHeaders key={t.id} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.fixtures.map((f) => {
                  const live = f.status === 'IN_PROGRESS';
                  return (
                    // Bewusst KEINE Zeilentönung für laufende Partien: sie legt sich unter die
                    // Punkte-Heatmap und macht einen vorläufigen 2er von einem endgültigen
                    // ununterscheidbar. Live-Kennzeichnung tragen der Zwischenstand-Pill und
                    // die „läuft"-Pill — beide in der immer sichtbaren Master-Spalte.
                    <tr key={f.id}>
                      <td className={cn(MASTER_STICKY, 'border-border/40 bg-card z-10 border-b px-4 py-1.5')}>
                        <span className="flex items-center gap-2">
                          <span>
                            <span className="font-medium">{f.homeTeam}</span>
                            <span className="text-muted-foreground mx-1">:</span>
                            <span className="font-medium">{f.awayTeam}</span>
                          </span>
                          {live ? (
                            // Live-Zwischenstand: pitch-farbig + pulsierender Punkt
                            <span className="bg-pitch/15 text-pitch inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums">
                              <span className="bg-pitch h-1.5 w-1.5 animate-pulse rounded-full" aria-hidden="true" />
                              {f.resultHome !== null && f.resultAway !== null
                                ? `${f.resultHome}:${f.resultAway}`
                                : 'läuft'}
                            </span>
                          ) : (
                            <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs tabular-nums">
                              {f.resultHome !== null && f.resultAway !== null ? `${f.resultHome}:${f.resultAway}` : '–'}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="border-border/40 border-b px-2 py-1.5">
                        <StatusPill status={f.status} />
                      </td>
                      {view.tippers.map((t) => {
                        const cell = t.tipsByFixture.get(f.id);
                        return <TipperCells key={t.id} cell={cell} />;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SubHeaders() {
  return (
    <>
      <th className="border-border/40 border-l px-1 py-1 text-center" colSpan={3}>
        Tipp
      </th>
      <th className="border-border/40 border-l px-1 py-1 text-center">Pkt</th>
      <th className="border-border/40 border-l px-1 py-1 text-center">3er</th>
      <th className="border-border/40 border-l px-1 py-1 text-center">2er</th>
    </>
  );
}

function TipperCells({ cell }: { cell: TipCell | undefined }) {
  const emergencyClass = cell?.emergency ? 'italic' : '';
  const hasTip = cell?.tipHome !== null && cell?.tipHome !== undefined;

  // Endstand schlägt Zwischenstand: livePoints ist laut Typ nur gesetzt, solange points null ist.
  const live = cell?.points == null && cell?.livePoints != null;
  const shownPoints = cell?.points ?? cell?.livePoints ?? null;

  // Gleiche Heatmap für beide, bei laufenden Partien nur blasser. Keine eigene
  // Formensprache: die Zeile ist über Tönung und „läuft"-Pill ohnehin als live erkennbar.
  const bg = pointsBg(shownPoints, live);
  const edge = 'border-border/40 border-b';

  // Notfalltipp-Ersatzwerte kursiv — so bleibt erkennbar, dass nicht echt getippt wurde.
  const title =
    [
      cell?.emergency ? 'Notfalltipp (automatischer Ersatz)' : null,
      live ? 'Vorläufige Punkte — Partie läuft noch' : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  return (
    <>
      <td
        title={title}
        className={cn(edge, 'border-l px-1 py-1 text-center font-mono tabular-nums', bg, emergencyClass)}
      >
        {hasTip ? cell?.tipHome : ''}
      </td>
      <td className={cn(edge, 'text-muted-foreground px-0 text-center', bg)}>:</td>
      <td title={title} className={cn(edge, 'px-1 py-1 text-center font-mono tabular-nums', bg, emergencyClass)}>
        {hasTip ? cell?.tipAway : ''}
      </td>
      <td
        title={title}
        className={cn(edge, 'border-l px-1 py-1 text-center font-mono tabular-nums', bg, pointsClass(shownPoints))}
      >
        {shownPoints ?? '–'}
      </td>
      <td className={cn(edge, 'px-1 py-1 text-center', bg)}></td>
      <td className={cn(edge, 'px-1 py-1 text-center', bg)}></td>
    </>
  );
}
