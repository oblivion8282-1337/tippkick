import { ClipboardList, Download, ListChecks } from 'lucide-react';

import type { TipptagListItem } from '@/lib/rounds';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { formatDateRange } from '@/lib/datetime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';

/**
 * Vollständige Liste aller Tipptage einer Saison mit Auswertung + Excel je Zeile.
 * Der Blick zurück — im Gegensatz zu „Nächste Deadlines" (nur offene Tipptage)
 * sind hier auch die abgeschlossenen erreichbar.
 */
export function TipptagList({ tipptage }: { tipptage: TipptagListItem[] }) {
  return (
    <Card>
      <CardHeader className="border-border/40 border-b">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Tipptage ({tipptage.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {tipptage.length === 0 ? (
          <p className="text-muted-foreground px-6 py-8 text-sm">Noch keine Tipptage angelegt.</p>
        ) : (
          <div className="divide-border/40 divide-y">
            {tipptage.map((tt) => {
              const assigned = tt.sections.length > 0;
              const sectionLabel = assigned
                ? tt.sections
                    .map((s) => `${s.league ? LEAGUE_SECTION_LABELS[s.league] : 'Liga'} ${s.number}`)
                    .join(' + ')
                : 'noch keine Spieltage zugeordnet';
              const resultLabel =
                tt.fixtureCount === 0
                  ? null
                  : tt.finishedCount === tt.fixtureCount
                    ? 'vollständig'
                    : `${tt.finishedCount}/${tt.fixtureCount} Ergebnisse`;
              return (
                <div key={tt.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 text-sm">
                  <span className="font-display w-28 shrink-0 font-semibold">Tipptag {tt.number}</span>
                  {assigned && (
                    <span className="text-muted-foreground w-28 shrink-0 tabular-nums">
                      {formatDateRange(tt.startDate, tt.endDate)}
                    </span>
                  )}
                  <span className="text-muted-foreground min-w-40 flex-1">{sectionLabel}</span>
                  {resultLabel && <span className="text-muted-foreground shrink-0 tabular-nums">{resultLabel}</span>}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      tt.hasStarted ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {tt.hasStarted ? 'gelaufen' : 'offen'}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <LinkButton href={`/admin/matchdays/${tt.id}/auswertung`} size="sm" variant="outline">
                      <ClipboardList className="h-4 w-4" />
                      Auswertung
                    </LinkButton>
                    <LinkButton href={`/admin/matchdays/${tt.id}/export`} size="sm" variant="outline">
                      <Download className="h-4 w-4" />
                      Excel
                    </LinkButton>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
