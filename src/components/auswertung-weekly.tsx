import type { AuswertungView, PointTotals } from '@/lib/auswertung';
import { BonusPointsForm } from '@/components/bonus-points-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const NUM = 'px-3 py-2 text-center font-mono tabular-nums';

/**
 * TW-Wochenauswertung: pro Tipper Tagespunkte (Fr/Sa/So/Mo), Liga-Splits
 * (TW-BL/TW-2L), 3er/2er/1er-Zählung, Zusatzpunkte (ZP, editierbar) und Gesamt.
 * Mit Summen- und Schnittzeile.
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
                <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">Tipper</th>
                <th className={NUM}>Fr</th>
                <th className={NUM}>Sa</th>
                <th className={NUM}>So</th>
                <th className={NUM}>Mo</th>
                <th className={NUM}>TW-BL</th>
                <th className={NUM}>TW-2L</th>
                <th className={NUM}>3er</th>
                <th className={NUM}>2er</th>
                <th className={NUM}>1er</th>
                <th className="px-3 py-2 text-center font-medium">ZP</th>
                <th className={NUM}>TW-Ges</th>
              </tr>
            </thead>
            <tbody>
              {view.tippers.map((t) => (
                <tr key={t.id} className="border-border/40 border-b">
                  <td className="sticky left-0 z-10 bg-card px-4 py-1.5 font-medium">{t.name}</td>
                  <td className={NUM}>{fmt(t.daily.fr)}</td>
                  <td className={NUM}>{fmt(t.daily.sa)}</td>
                  <td className={NUM}>{fmt(t.daily.so)}</td>
                  <td className={NUM}>{fmt(t.daily.mo)}</td>
                  <td className={NUM}>{fmt(t.blPoints)}</td>
                  <td className={NUM}>{fmt(t.l2Points)}</td>
                  <td className={NUM}>{t.counts.three}</td>
                  <td className={NUM}>{t.counts.two}</td>
                  <td className={NUM}>{t.counts.one}</td>
                  <td className="px-2 py-1 text-center">
                    <BonusPointsForm matchdayId={view.matchdayId} userId={t.id} bonusPts={t.bonusPts} />
                  </td>
                  <td className={`${NUM} text-primary font-semibold`}>{t.totalWithBonus}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow label="Summe" data={view.totals} />
              <TotalRow label="Ø" data={view.averages} />
            </tfoot>
          </table>
        </div>
        <p className="text-muted-foreground px-4 py-2 text-xs">ZP = manuelle Zusatzpunkte der Tippleitung (fließen in TW-Ges ein).</p>
      </CardContent>
    </Card>
  );
}

function TotalRow({ label, data }: { label: string; data: PointTotals }) {
  return (
    <tr className="bg-muted/40 border-border/40 border-t font-medium">
      <td className="sticky left-0 z-10 bg-muted/40 px-4 py-1.5">{label}</td>
      <td className={NUM}>{fmt(data.daily.fr)}</td>
      <td className={NUM}>{fmt(data.daily.sa)}</td>
      <td className={NUM}>{fmt(data.daily.so)}</td>
      <td className={NUM}>{fmt(data.daily.mo)}</td>
      <td className={NUM}>{fmt(data.bl)}</td>
      <td className={NUM}>{fmt(data.l2)}</td>
      <td className={NUM}>{data.counts.three}</td>
      <td className={NUM}>{data.counts.two}</td>
      <td className={NUM}>{data.counts.one}</td>
      <td className={NUM}>{fmt(data.bonus)}</td>
      <td className={`${NUM} text-primary`}>{fmt(data.withBonus)}</td>
    </tr>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
