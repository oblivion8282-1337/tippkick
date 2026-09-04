import { notFound } from 'next/navigation';
import { CalendarClock, ChevronLeft, Lock } from 'lucide-react';

import { buildAuswertung } from '@/lib/auswertung';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isTippable } from '@/lib/matchdays';
import { Breadcrumb } from '@/components/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { AuswertungGrid } from '@/components/auswertung-grid';
import { AuswertungWeekly } from '@/components/auswertung-weekly';
import { AutoRefresh } from '@/components/auto-refresh';

export const dynamic = 'force-dynamic';

export default async function UserAuswertungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const md = await prisma.matchday.findUnique({
    where: { id },
    select: { id: true, deadlineAt: true },
  });
  if (!md) {
    notFound();
  }

  // Vor der Deadline stehen noch nicht alle Tipps fest — die Auswertung
  // bleibt bis dahin versiegelt, sonst wären fremde Tipps vorzeitig sichtbar.
  // Versiegelt = noch tippbar (Deadline in der Zukunft).
  const sealed = isTippable(md.deadlineAt);
  if (sealed) {
    const deadlineLabel = new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(md.deadlineAt);
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Fieber' },
          ]}
        />
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-10">
            <Lock className="text-muted-foreground h-6 w-6" />
            <p className="font-medium">Dieses Fieber ist noch versiegelt.</p>
            <p className="text-muted-foreground text-sm">
              Sie wird freigegeben, sobald die Tipp-Deadline am {deadlineLabel} Uhr abgelaufen ist.
            </p>
            <LinkButton href="/dashboard" size="sm" variant="outline">
              <ChevronLeft className="h-4 w-4" />
              Zurück zum Dashboard
            </LinkButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  const view = await buildAuswertung(id);
  if (!view) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Live-Ticker: alle 30 s neue Ergebnisse ziehen (Cron syncet alle 15 min). */}
      <AutoRefresh intervalMs={30_000} />
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: view.matchdayLabel ?? `${view.matchdayNumber}. Tipptag`, href: '/dashboard' },
            { label: 'Fieber' },
          ]}
        />
        <PageHeader
          eyebrow={`${view.competitionName} · ${view.seasonName} · ${view.dateRangeLabel}`}
          title={view.matchdayLabel ? `${view.matchdayLabel} — Fieber` : `${view.matchdayNumber}. Tipptag — Fieber`}
          actions={
            <LinkButton href="/dashboard" size="sm" variant="outline">
              <ChevronLeft className="h-4 w-4" />
              Zurück zum Dashboard
            </LinkButton>
          }
        />
      </div>

      {/* Tipps sind ab Deadline sichtbar; Punkte/Summen erst mit beendeten Partien. */}
      <AuswertungGrid view={view} />
      {view.hasAnyScoreable ? (
        <AuswertungWeekly view={view} />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <CalendarClock className="text-muted-foreground h-5 w-5" />
            <p className="text-muted-foreground text-sm">
              Noch keine Ergebnisse: Sobald die Partien beendet sind, werden hier Punkte und die Wochenauswertung
              berechnet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
