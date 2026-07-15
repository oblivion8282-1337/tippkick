import { notFound } from 'next/navigation';

import { getMyTips } from '@/lib/tipps';
import { isTippable } from '@/lib/matchdays';
import { requireUser } from '@/lib/session';
import { formatDateTime } from '@/lib/datetime';
import { TipMaskForm } from '@/components/tip-mask-form';

type ExistingTip = { homeGoals: number; awayGoals: number };

export default async function TippenPage({ params }: { params: Promise<{ matchdayId: string }> }) {
  const session = await requireUser();
  const { matchdayId } = await params;

  const data = await getMyTips(session.user.id, matchdayId);
  if (!data) {
    notFound();
  }

  const { matchday, tipsByFixture } = data;
  const existing: Record<string, ExistingTip> = {};
  for (const [fixtureId, tip] of tipsByFixture) {
    existing[fixtureId] = { homeGoals: tip.homeGoals, awayGoals: tip.awayGoals };
  }

  const open = isTippable(matchday.deadlineAt);
  const fixtures = matchday.fixtures.map((f) => ({
    id: f.id,
    league: f.league,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{matchday.number}. Spieltag</h1>
        <p className="text-muted-foreground text-sm">
          Deadline {formatDateTime(matchday.deadlineAt)} – Tipps werden automatisch gespeichert.
        </p>
      </div>

      <TipMaskForm fixtures={fixtures} existingTips={existing} open={open} />
    </div>
  );
}
