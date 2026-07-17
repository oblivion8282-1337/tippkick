import { notFound } from 'next/navigation';
import { CalendarClock, Download } from 'lucide-react';

import { buildAuswertung } from '@/lib/auswertung';
import { Breadcrumb } from '@/components/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { AuswertungGrid } from '@/components/auswertung-grid';
import { AuswertungWeekly } from '@/components/auswertung-weekly';

export const dynamic = 'force-dynamic';

export default async function AuswertungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await buildAuswertung(id);
  if (!view) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: 'Admin', href: `/admin/matchdays/${id}` },
            { label: `${view.matchdayNumber}. Tipptag`, href: `/admin/matchdays/${id}` },
            { label: 'Auswertung' },
          ]}
        />
        <PageHeader
          eyebrow={`${view.competitionName} · ${view.seasonName} · ${view.dateRangeLabel}`}
          title={`${view.matchdayNumber}. Tipptag — Online-Auswertung`}
          actions={
            <div className="flex gap-2">
              <LinkButton href={`/admin/matchdays/${id}/export`} size="sm" variant="outline">
                <Download className="h-4 w-4" />
                Als Excel
              </LinkButton>
              <LinkButton href={`/admin/matchdays/${id}`} size="sm" variant="outline">
                Zum Spieltag
              </LinkButton>
            </div>
          }
        />
      </div>

      {!view.hasAnyScoreable ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <CalendarClock className="text-muted-foreground h-5 w-5" />
            <p className="text-muted-foreground text-sm">
              Noch keine Ergebnisse: Sobald Partien beendet sind (automatischer OpenLigaDB-Sync oder manuelle Erfassung
              auf der Spieltag-Seite), werden hier Punkte, Tages- und Wochenauswertung berechnet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <AuswertungGrid view={view} />
          <AuswertungWeekly view={view} />
        </>
      )}
    </div>
  );
}
