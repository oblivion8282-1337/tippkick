import { FIXTURE_STATUS_LABELS } from '@/lib/constants';
import type { AuswertungView, TipCell } from '@/lib/auswertung';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MASTER_STICKY = 'sticky left-0 z-10 bg-card';

function pointsClass(points: TipCell['points'] | undefined): string {
  if (points === 3) return 'text-primary font-semibold';
  if (points === 2) return 'text-emerald-600';
  if (points === 1) return 'text-amber-600';
  return 'text-muted-foreground/60';
}

/**
 * 34.TT-Raster: Partien als Zeilen, pro Tipper ein originalgetreuer 6-Spalten-Block
 * (Tipp-Heim | : | Tipp-Gast | Pkt | 3er | 2er). Ergebnis aus Fixture, Punkte berechnet.
 */
export function AuswertungGrid({ view }: { view: AuswertungView }) {
  return (
    <Card>
      <CardHeader className="border-border/40 border-b">
        <CardTitle>34.TT — Tipps &amp; Punkte</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        <div className="overflow-x-auto">
          {view.sections.map((section) => (
            <table key={section.league} className="w-full border-border/40 border-collapse border-y text-sm">
              <thead>
                <tr>
                  <th
                    colSpan={2 + view.tippers.length * 6}
                    className="bg-muted/40 border-border/40 px-4 py-2 text-left font-display text-base font-semibold"
                  >
                    {section.label} ·{' '}
                    <span className="text-muted-foreground font-normal">{section.sectionNumber}. Spieltag</span>
                  </th>
                </tr>
                <tr className="border-border/40 border-b text-xs">
                  <th className={`${MASTER_STICKY} px-4 py-2 text-left`}>Partie · Erg.</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  {view.tippers.map((t) => (
                    <th key={t.id} colSpan={6} className="border-border/40 border-l px-2 py-1 text-center font-medium">
                      {t.name}
                    </th>
                  ))}
                </tr>
                <tr className="text-muted-foreground border-border/40 border-b text-[10px] uppercase">
                  <th className={`${MASTER_STICKY} px-4 py-1`}></th>
                  <th className="px-2 py-1"></th>
                  {view.tippers.map((t) => (
                    <SubHeaders key={t.id} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.fixtures.map((f) => (
                  <tr key={f.id} className="border-border/40 border-b">
                    <td className={`${MASTER_STICKY} px-4 py-1.5`}>
                      <span className="flex items-center gap-2">
                        <span>
                          <span className="font-medium">{f.homeTeam}</span>
                          <span className="text-muted-foreground mx-1">:</span>
                          <span className="font-medium">{f.awayTeam}</span>
                        </span>
                        <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs tabular-nums">
                          {f.resultHome !== null && f.resultAway !== null ? `${f.resultHome}:${f.resultAway}` : '–'}
                        </span>
                      </span>
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5 text-xs">{FIXTURE_STATUS_LABELS[f.status]}</td>
                    {view.tippers.map((t) => {
                      const cell = t.tipsByFixture.get(f.id);
                      return <TipperCells key={t.id} cell={cell} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
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
  const hasTip = cell?.tipHome !== null && cell?.tipHome !== undefined;
  return (
    <>
      <td className="border-border/40 border-l px-1 py-1 text-center font-mono tabular-nums">{hasTip ? cell?.tipHome : ''}</td>
      <td className="text-muted-foreground px-0 text-center">:</td>
      <td className="px-1 py-1 text-center font-mono tabular-nums">{hasTip ? cell?.tipAway : ''}</td>
      <td className={`border-border/40 border-l px-1 py-1 text-center font-mono tabular-nums ${pointsClass(cell?.points)}`}>
        {cell?.points ?? '–'}
      </td>
      <td className="px-1 py-1 text-center"></td>
      <td className="px-1 py-1 text-center"></td>
    </>
  );
}
