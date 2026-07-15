import Link from 'next/link';

import { getActiveMatchday, isTippable } from '@/lib/matchdays';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';

export default async function DashboardPage() {
  const session = await requireUser();
  const matchday = await getActiveMatchday();

  if (!matchday) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">Aktuell ist kein Spieltag zur Tippabgabe freigeschaltet.</p>
      </div>
    );
  }

  const tipped = await prisma.tip.count({
    where: { userId: session.user.id, fixture: { matchdayId: matchday.id } },
  });
  const total = matchday.fixtures.length;
  const open = isTippable(matchday.deadlineAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{matchday.number}. Spieltag</h1>
          <p className="text-muted-foreground text-sm">
            {matchday.season.name} · Deadline {formatDateTime(matchday.deadlineAt)}
          </p>
        </div>
        <Button render={<Link href={`/tippen/${matchday.id}`} />}>{open ? 'Tippen' : 'Tipps ansehen'}</Button>
      </div>

      <div className="rounded-lg border p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">Dein Tipp-Fortschritt</span>
          <span className="font-medium">
            {tipped} / {total}
          </span>
        </div>
        <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${total > 0 ? (tipped / total) * 100 : 0}%` }}
          />
        </div>
        {!open && (
          <p className="text-destructive mt-3 text-sm">
            Die Deadline ist abgelaufen – Tipps können nicht mehr geändert werden.
          </p>
        )}
      </div>
    </div>
  );
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
