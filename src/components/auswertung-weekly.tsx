import type { AuswertungView, DayColumn, PointTotals } from '@/lib/auswertung';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const NUM = 'px-3 py-2 text-center font-mono tabular-nums';

/**
 * TW-Wochenauswertung: pro Tipper Tagespunkte, Liga-Splits (TW-BL/TW-2L),
 * 3er/2er/1er-Zählung und Gesamt. Mit Summen- und Schnittzeile.
 *
 * Die Tagesspalten kommen aus `view.days` — also aus den echten Anstoßtagen des
 * Tipptags. Bei einer englischen Woche stehen hier Di/Mi/Do statt Fr/Sa/So, und
 * die Tagespunkte summieren sich immer auf TW-Ges.
 */
export function AuswertungWeekly({ view }: { view: AuswertungView }) {
  return (
    <Card>
      <CardHeader className="border-border/40 border-b">
        <CardTitle>TW — Wochenauswertung</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border/40 text-muted-foreground border-b text-xs uppercase">
                <th className="bg-card sticky left-0 z-10 px-4 py-2 text-left font-medium">Tipper</th>
                {view.days.map((day) => (
                  <th key={day.key} className={NUM}>
                    {day.label}
                  </th>
                ))}
                <th className={NUM}>TW-BL</th>
                <th className={NUM}>TW-2L</th>
                <th className={NUM}>3er</th>
                <th className={NUM}>2er</th>
                <th className={NUM}>1er</th>
                <th className={NUM}>TW-Ges</th>
              </tr>
            </thead>
            <tbody>
              {view.tippers.map((t) => (
                <tr key={t.id} className="border-border/40 border-b">
                  <td className="bg-card sticky left-0 z-10 px-4 py-1.5 font-medium">{t.name}</td>
                  {view.days.map((day) => (
                    <td key={day.key} className={NUM}>
                      {fmt(t.daily[day.key] ?? 0)}
                    </td>
                  ))}
                  <td className={NUM}>{fmt(t.blPoints)}</td>
                  <td className={NUM}>{fmt(t.l2Points)}</td>
                  <td className={NUM}>{t.counts.three}</td>
                  <td className={NUM}>{t.counts.two}</td>
                  <td className={NUM}>{t.counts.one}</td>
                  <td className={`${NUM} text-primary font-semibold`}>{t.totalPoints}</td>
                </tr>
              ))}
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
    <tr className="bg-muted/40 border-border/40 border-t font-medium">
      <td className="bg-muted/40 sticky left-0 z-10 px-4 py-1.5">{label}</td>
      {days.map((day) => (
        <td key={day.key} className={NUM}>
          {fmt(data.daily[day.key] ?? 0)}
        </td>
      ))}
      <td className={NUM}>{fmt(data.bl)}</td>
      <td className={NUM}>{fmt(data.l2)}</td>
      <td className={NUM}>{data.counts.three}</td>
      <td className={NUM}>{data.counts.two}</td>
      <td className={NUM}>{data.counts.one}</td>
      <td className={`${NUM} text-primary`}>{fmt(data.total)}</td>
    </tr>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
