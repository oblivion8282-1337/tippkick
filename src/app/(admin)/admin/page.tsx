import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { getMatchdays } from '@/lib/matchdays';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { formatDateRange } from '@/lib/datetime';

export default async function AdminHomePage() {
  const matchdays = await getMatchdays();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Tippleitung"
        title="Tipptage"
        description="Spieltage werden automatisch aus OpenLigaDB importiert. Hier gruppierst du sie zu Tipptagen und exportierst die Tipps als Excel."
        actions={
          <>
            <LinkButton href="/admin/spieltage" size="sm">
              Spieltage gruppieren
            </LinkButton>
            <LinkButton href="/admin/matchdays/new" variant="outline" size="sm">
              Manuell anlegen
            </LinkButton>
          </>
        }
      />

      {matchdays.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Noch keine Spieltage angelegt.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b border-border/40">
            <CardTitle>Alle Tipptage</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y divide-border/40">
              {matchdays.map((md) => (
                <li key={md.id}>
                  <Link
                    href={`/admin/matchdays/${md.id}`}
                    className="hover:bg-muted/40 group flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-baseline gap-3">
                        <span className="font-display text-2xl font-semibold tabular-nums">
                          {md.number}.
                        </span>
                        <span className="font-medium">{md.competition.name}</span>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {md.competition.season.name} · {formatDateRange(md.startDate, md.endDate)} ·{' '}
                        {md._count.sections} {md._count.sections === 1 ? 'Sektion' : 'Sektionen'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground hidden text-xs sm:inline">Öffnen</span>
                      <ChevronRight className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}