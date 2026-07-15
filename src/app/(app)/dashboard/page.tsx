import { getCompetitions, isTippable, pickDefaultMatchday } from '@/lib/matchdays';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/datetime';
import { LinkButton } from '@/components/link-button';

export default async function DashboardPage() {
  const session = await requireUser();
  const competitions = await getCompetitions();

  if (competitions.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">Aktuell sind keine Wettbewerbe freigeschaltet.</p>
      </div>
    );
  }

  // Pro Wettbewerb: aktueller (aktiver) Spieltag + Tipp-Fortschritt des Nutzers.
  const rows = await Promise.all(
    competitions.map(async (c) => {
      const active = pickDefaultMatchday(c.matchdays);
      if (!active) {
        return null;
      }
      const activeMatchday = await prisma.matchday.findFirst({
        where: { competitionId: c.id, number: active.number },
        select: { id: true },
      });
      if (!activeMatchday) {
        return null;
      }
      const fixtureFilter = { section: { matchdayId: activeMatchday.id } };
      const [tipped, total] = await Promise.all([
        prisma.tip.count({ where: { userId: session.user.id, fixture: fixtureFilter } }),
        prisma.fixture.count({ where: fixtureFilter }),
      ]);
      return { c, active, tipped, total, open: isTippable(active.deadlineAt) };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Deine Wettbewerbe</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.filter(Boolean).map((row) => {
          const { c, active, tipped, total, open } = row!;
          return (
            <div key={c.id} className="flex flex-col gap-3 rounded-lg border p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground text-sm">{active.number}. Spieltag</span>
              </div>
              <p className="text-muted-foreground text-xs">Deadline {formatDateTime(active.deadlineAt)}</p>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${total > 0 ? (tipped / total) * 100 : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {tipped} / {total} getippt
                </span>
                <LinkButton
                  href={{ pathname: '/tippen', query: { competition: c.key, matchday: active.number } }}
                  size="sm"
                >
                  {open ? 'Tippen' : 'Ansehen'}
                </LinkButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
