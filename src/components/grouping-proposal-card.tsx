import { ArrowRight, Lightbulb, Lock } from 'lucide-react';

import type { GroupingProposal } from '@/lib/rounds';
import { LEAGUE_SECTION_LABELS } from '@/lib/constants';
import { applyGroupingAction } from '@/app/(admin)/admin/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';

/**
 * Vorschau des abgeleiteten Tipptag-Vorschlags: zeigt jede Zuordnung, die sich
 * ändern würde, bevor irgendetwas geschrieben wird. Die Tippleitung bestätigt.
 */
export function GroupingProposalCard({
  proposal,
  competitionId,
  seasonId,
}: {
  proposal: GroupingProposal;
  competitionId: string;
  seasonId: string;
}) {
  const nothingToDo = proposal.changes.length === 0;
  return (
    <Card>
      <CardHeader className="border-border/40 border-b">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4" /> Vorschlag: Spieltage den Tipptagen zuordnen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <p className="text-muted-foreground text-sm">
          Abgeleitet aus der Spielreihenfolge: je zwei Liga-Spieltage nacheinander ergeben einen Tipptag (18 Partien).
          Nichts ist gespeichert — erst mit „Übernehmen“.
        </p>

        {nothingToDo ? (
          <p className="text-sm">Alle {proposal.unchangedCount} Spieltage liegen bereits richtig. Nichts zu tun.</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold">{proposal.changes.length}</span> Zuordnungen ändern sich,{' '}
              {proposal.unchangedCount} bleiben.
            </p>
            <ul className="border-border/60 divide-border/40 max-h-80 divide-y overflow-y-auto rounded-lg border text-sm">
              {proposal.changes.map((change) => (
                <li key={change.sectionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <span className="font-medium">
                    {change.league ? LEAGUE_SECTION_LABELS[change.league] : 'Wettbewerb'} · {change.number}. Spieltag
                  </span>
                  <span className="text-muted-foreground ml-auto flex items-center gap-2 tabular-nums">
                    {change.fromMatchdayNumber === null ? (
                      <span className="italic">nicht zugeordnet</span>
                    ) : (
                      <span>{change.fromMatchdayNumber}. Tipptag</span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span className="text-foreground font-semibold">{change.toMatchdayNumber}. Tipptag</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {proposal.blocked.length > 0 && (
          <div className="border-border/60 bg-muted/40 space-y-1 rounded-lg border px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Lock className="h-3.5 w-3.5" /> {proposal.blocked.length} Spieltage bleiben unangetastet — es liegen
              schon Tipps vor
            </p>
            <p className="text-muted-foreground text-xs">
              Ein Umzug würde ihre Deadline verschieben und damit nachträglich entscheiden, ob abgegebene Tipps zählen.
              Falls nötig, unten von Hand umstellen.
            </p>
            <ul className="text-muted-foreground pt-1 text-xs">
              {proposal.blocked.map((change) => (
                <li key={change.sectionId}>
                  {change.league ? LEAGUE_SECTION_LABELS[change.league] : 'Wettbewerb'} · {change.number}. Spieltag:{' '}
                  {change.fromMatchdayNumber ?? '—'} → {change.toMatchdayNumber}
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.missingMatchdayNumbers.length > 0 && (
          <p className="text-destructive text-sm">
            Es fehlen Tipptage mit den Nummern {proposal.missingMatchdayNumbers.join(', ')} — erst oben anlegen.
          </p>
        )}

        <div className="flex items-center gap-2">
          <form action={applyGroupingAction}>
            <input type="hidden" name="competitionId" value={competitionId} />
            <input type="hidden" name="seasonId" value={seasonId} />
            <Button type="submit" disabled={nothingToDo}>
              Übernehmen
            </Button>
          </form>
          <LinkButton href={`/admin/spieltage?season=${seasonId}`} variant="outline">
            Abbrechen
          </LinkButton>
        </div>
      </CardContent>
    </Card>
  );
}
