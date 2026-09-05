import type { AuswertungView, DayColumn, PointTotals } from '@/lib/auswertung';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const NUM = 'px-3 py-2 text-center font-mono tabular-nums';

/** Summenzeile: transparent für die Zeile, deckend geflacht für die Sticky-Zelle. */
const TOTAL_STICKY_TINT = 'bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]';

/**
 * Podiums-Farben (Gold/Silber/Bronze, dezent) — Rang dynamisch aus den Punkten.
 *
 * Zwei Varianten pro Rang, bewusst nebeneinander definiert: `row` tönt die Zeile
 * transparent, `sticky` ist dieselbe Tönung deckend auf `--card` geflacht. Die
 * Sticky-Spalte MUSS deckend sein — sonst schimmern die darunter durchscrollenden
 * Spalten durch (eine transparente Tönung überschreibt sonst das `bg-card`).
 */
function rankBg(rank: number): { row: string; sticky: string } {
  if (rank === 1) {
    return { row: 'bg-amber-400/15', sticky: 'bg-[color-mix(in_oklab,var(--color-amber-400)_15%,var(--card))]' };
  }
  if (rank === 2) {
    return { row: 'bg-foreground/10', sticky: 'bg-[color-mix(in_oklab,var(--foreground)_10%,var(--card))]' };
  }
  if (rank === 3) {
    return { row: 'bg-orange-400/10', sticky: 'bg-[color-mix(in_oklab,var(--color-orange-400)_10%,var(--card))]' };
  }
  return { row: '', sticky: 'bg-card' };
}

/**
 * TW-Wochenauswertung: pro Tipper Tagespunkte, Liga-Splits (TW-BL/TW-2L),
 * 3er/2er/1er-Zählung und Gesamt. Mit Summen- und Schnittzeile.
 *
 * Die Tagesspalten kommen aus `view.days` — also aus den echten Anstoßtagen des
 * Tipptags. Bei einer englischen Woche stehen hier Di/Mi/Do statt Fr/Sa/So, und
 * die Tagespunkte summieren sich immer auf TW-Ges.
 */
export function AuswertungWeekly({ view }: { view: AuswertungView }) {
  // Rang = Position in der absteigend sortierten Gesamt-Punkteliste (geteilt bei Gleichstand).
  const totalsDesc = view.tippers.map((t) => t.totalPoints).sort((a, b) => b - a);
  const rankOf = (points: number) => totalsDesc.indexOf(points) + 1;

  return (
    <Card>
      <CardHeader className="border-border/40 border-b">
        <CardTitle>TW — Wochenauswertung</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        <div className="overflow-x-auto">
          {/* border-separate statt border-collapse: sonst rendert der Browser Zellrahmen/
              -hintergründe als Teil des Tabellen-Renderings statt pro Zelle isoliert — das
              kollidiert mit position: sticky und die durchscrollenden Spalten schimmern
              unter der fixierten Tipper-Spalte durch. */}
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="text-muted-foreground text-xs uppercase">
                <th className="bg-card border-border/40 sticky left-0 z-10 border-b px-4 py-2 text-left font-medium">
                  Tipper
                </th>
                {view.days.map((day) => (
                  <th key={day.key} className={`${NUM} border-border/40 border-b`}>
                    {day.label}
                  </th>
                ))}
                <th className={`${NUM} border-border/40 border-b`}>TW-BL</th>
                <th className={`${NUM} border-border/40 border-b`}>TW-2L</th>
                <th className={`${NUM} border-border/40 border-b`}>3er</th>
                <th className={`${NUM} border-border/40 border-b`}>2er</th>
                <th className={`${NUM} border-border/40 border-b`}>1er</th>
                <th className={`${NUM} border-border/40 border-b`}>TW-Ges</th>
              </tr>
            </thead>
            <tbody>
              {view.tippers.map((t) => {
                const bg = rankBg(rankOf(t.totalPoints));
                return (
                  <tr key={t.id} className={bg.row}>
                    {/* Sticky-Zelle muss den Zeilen-Hintergrund mitnehmen, sonst Silber/Bronze-Balken abgehackt. */}
                    <td className={`border-border/40 sticky left-0 z-10 border-b px-4 py-1.5 font-medium ${bg.sticky}`}>
                      {t.name}
                    </td>
                    {view.days.map((day) => (
                      <td key={day.key} className={`${NUM} border-border/40 border-b`}>
                        {fmt(t.daily[day.key] ?? 0)}
                      </td>
                    ))}
                    <td className={`${NUM} border-border/40 border-b`}>{fmt(t.blPoints)}</td>
                    <td className={`${NUM} border-border/40 border-b`}>{fmt(t.l2Points)}</td>
                    <td className={`${NUM} border-border/40 border-b`}>{t.counts.three}</td>
                    <td className={`${NUM} border-border/40 border-b`}>{t.counts.two}</td>
                    <td className={`${NUM} border-border/40 border-b`}>{t.counts.one}</td>
                    <td className={`${NUM} border-border/40 text-primary border-b font-semibold`}>{t.totalPoints}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <TotalRow label="Summe" days={view.days} data={view.totals} />
              <TotalRow label="Ø" days={view.days} data={view.averages} />
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TotalRow({ label, days, data }: { label: string; days: DayColumn[]; data: PointTotals }) {
  return (
    <tr className="bg-muted/40 font-medium">
      {/* Deckend geflacht statt bg-muted/40 — transparente Sticky-Zellen lassen die
          durchscrollenden Spalten durchschimmern. */}
      <td className={`border-border/40 sticky left-0 z-10 border-t px-4 py-1.5 ${TOTAL_STICKY_TINT}`}>{label}</td>
      {days.map((day) => (
        <td key={day.key} className={`${NUM} border-border/40 border-t`}>
          {fmt(data.daily[day.key] ?? 0)}
        </td>
      ))}
      <td className={`${NUM} border-border/40 border-t`}>{fmt(data.bl)}</td>
      <td className={`${NUM} border-border/40 border-t`}>{fmt(data.l2)}</td>
      <td className={`${NUM} border-border/40 border-t`}>{data.counts.three}</td>
      <td className={`${NUM} border-border/40 border-t`}>{data.counts.two}</td>
      <td className={`${NUM} border-border/40 border-t`}>{data.counts.one}</td>
      <td className={`${NUM} border-border/40 text-primary border-t`}>{fmt(data.total)}</td>
    </tr>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
