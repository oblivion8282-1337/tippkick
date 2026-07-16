import { notFound } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';

import { deleteFixtureAction } from '@/app/(admin)/admin/actions';
import { getMatchdayAdmin } from '@/lib/admin';
import { formatDateRange, formatDateTime } from '@/lib/datetime';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { Breadcrumb } from '@/components/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FixtureResultForm } from '@/components/fixture-result-form';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';

export default async function MatchdayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchday = await getMatchdayAdmin(id);
  if (!matchday) {
    notFound();
  }

  const allFixtures = matchday.sections.flatMap((s) => s.fixtures);

  const seasonId = matchday.competition.season.id;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: 'Admin', href: `/admin?season=${seasonId}` },
            { label: 'Spieltage & Tipptage', href: `/admin/spieltage?season=${seasonId}` },
            { label: `${matchday.number}. Tipptag` },
          ]}
        />
        <PageHeader
          eyebrow={`${matchday.competition.name} · ${matchday.competition.season.name}`}
          title={`${matchday.number}. Tipptag`}
          description={`${formatDateRange(matchday.startDate, matchday.endDate)} · Deadline ${formatDateTime(matchday.deadlineAt)}`}
          actions={
            <LinkButton href={`/admin/matchdays/${matchday.id}/export`} size="sm">
              <Download className="h-4 w-4" />
              Als Excel
            </LinkButton>
          }
        />
      </div>

      <Card>
        <CardHeader className="border-border/40 border-b">
          <CardTitle>Partien ({allFixtures.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {matchday.sections.map((section) => (
            <section key={section.id} className="relative pl-5">
              <div aria-hidden="true" className="pitch-bar absolute top-2 bottom-2 left-0 w-1 rounded-full" />
              <h3 className="font-display mb-2 text-lg font-semibold tracking-tight">
                {section.league ? LEAGUE_SECTION_LABELS[section.league] : 'Wettbewerb'} ·{' '}
                <span className="text-muted-foreground font-display font-normal">{section.number}. Spieltag</span>
              </h3>
              {section.fixtures.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Partien.</p>
              ) : (
                <ul className="border-border/60 bg-card divide-border/40 divide-y overflow-hidden rounded-xl border">
                  {section.fixtures.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-mono tabular-nums">{formatDateTime(f.kickoff)}</span>
                      <span className="flex min-w-0 flex-1 items-center justify-center truncate">
                        <span className="font-medium">{f.homeTeam}</span>
                        <span className="text-muted-foreground mx-2">:</span>
                        <span className="font-medium">{f.awayTeam}</span>
                      </span>
                      <FixtureResultForm
                        key={`${f.id}-${f.homeGoals}-${f.awayGoals}-${f.status}-${f.resultSource}`}
                        fixtureId={f.id}
                        matchdayId={matchday.id}
                        home={f.homeGoals}
                        away={f.awayGoals}
                        status={f.status}
                        source={f.resultSource}
                      />
                      <form action={deleteFixtureAction.bind(null, matchday.id, f.id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Partie löschen">
                          <Trash2 />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
