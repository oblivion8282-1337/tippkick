'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, ClipboardList, Download } from 'lucide-react';

import { LinkButton } from '@/components/link-button';
import { UserAvatar } from '@/components/user-avatar';
import { formatWeekdayTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

type TippsData = {
  fixtures: { id: string; homeTeam: string; awayTeam: string; kickoff: string }[];
  rows: {
    id: string;
    name: string;
    admin: boolean;
    image: string | null;
    cnt: number;
    total: number;
    tips: Record<string, { homeGoals: number; awayGoals: number }>;
  }[];
};

/**
 * Eine Zeile der Tipptag-Chronik auf der Admin-Seite. Zusammenfassung ist serverseitig
 * vorbereitet (props), die Tipper-Matrix wird erst beim ersten Aufklappen nachgeladen —
 * sonst rendert die Seite bei 34 Tipptagen ~20k Listenelemente, die niemand sieht.
 */
export function TipptagRow({
  matchdayId,
  competitionShort,
  number,
  label = null,
  total,
  tippersTipped,
  activeCount,
  openCount,
  deadlineLabel,
  countdownLabel,
  resultsDone,
}: {
  matchdayId: string;
  competitionShort: string;
  number: number;
  label?: string | null;
  total: number;
  tippersTipped: number;
  activeCount: number;
  openCount: number;
  deadlineLabel: string;
  countdownLabel?: string;
  resultsDone: number;
}) {
  const [data, setData] = useState<TippsData | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (data || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/admin/api/matchday-tipps/${matchdayId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  // Abgeschlossene Tipptage (kein Countdown mehr) visuell zurücknehmen: gedimmt,
  // Wettbewerbs-Badge neutral statt akzentuiert — der Fokus liegt auf dem Offenen.
  const closed = countdownLabel === undefined;

  return (
    <details
      className="group"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) void load();
      }}
    >
      <summary
        className={cn(
          'hover:bg-muted/30 flex cursor-pointer flex-wrap items-center gap-3 px-6 py-4 text-sm transition-opacity [&::-webkit-details-marker]:hidden',
          closed ? 'opacity-60 hover:opacity-100' : 'opacity-100',
        )}
      >
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-semibold',
            closed ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
          )}
        >
          {competitionShort}
        </span>
        <Link href={`/admin/matchdays/${matchdayId}`} className="hover:underline">
          <span className="font-display font-semibold">{label ?? `Tipptag ${number}`}</span>
        </Link>
        <span className="text-muted-foreground tabular-nums">{total} Partien</span>
        <span className="text-muted-foreground tabular-nums">
          {tippersTipped}/{activeCount} vollständig
          {openCount > 0 && <span className="text-destructive"> · {openCount} offen</span>}
        </span>
        {countdownLabel !== undefined ? (
          <span className="text-muted-foreground ml-auto tabular-nums">
            {countdownLabel} · {deadlineLabel}
          </span>
        ) : (
          <span className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {resultsDone < total && (
              <span className="text-amber-500 tabular-nums" title="Ergebnisse eintragen oder syncen">
                Ergebnisse {resultsDone}/{total}
              </span>
            )}
            <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">abgeschlossen</span>
            <span className="text-muted-foreground tabular-nums">{deadlineLabel}</span>
          </span>
        )}
        <LinkButton href={`/admin/matchdays/${matchdayId}/auswertung`} size="sm" variant="outline">
          <ClipboardList className="h-4 w-4" />
          Auswertung
        </LinkButton>
        <LinkButton href={`/admin/matchdays/${matchdayId}/export`} size="sm" variant="outline">
          <Download className="h-4 w-4" />
          Excel
        </LinkButton>
      </summary>
      {!data ? (
        <p className="text-muted-foreground border-border/40 border-t px-6 py-3 pl-10 text-sm">
          {loading ? 'Tipper werden geladen …' : ''}
        </p>
      ) : (
        <ul className="border-border/40 border-t">
          {data.rows.map(({ id, name, admin, image, cnt, total: rowTotal, tips }) => {
            const done = rowTotal > 0 && cnt >= rowTotal;
            const partial = cnt > 0 && !done;
            return (
              <li key={id} className="pr-2 pl-10">
                <details className="group/tipper">
                  <summary className="hover:bg-muted/30 flex cursor-pointer items-center gap-2 py-2 pl-2 text-sm [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform group-open/tipper:rotate-90" />
                    <UserAvatar name={name} image={image} className="h-6 w-6 text-[10px]" />
                    <span className="font-medium">{name}</span>
                    {admin && <span className="text-muted-foreground text-xs">Tippleitung</span>}
                    <span
                      className={
                        done
                          ? 'text-primary ml-auto inline-flex items-center gap-1'
                          : partial
                            ? 'ml-auto text-amber-500'
                            : 'text-muted-foreground ml-auto'
                      }
                    >
                      {done ? (
                        <>
                          <Check className="h-3 w-3" /> vollständig
                        </>
                      ) : partial ? (
                        `teilweise (${cnt}/${rowTotal})`
                      ) : (
                        'noch offen'
                      )}
                    </span>
                  </summary>
                  <ul className="border-border/40 border-t pb-2">
                    {data.fixtures.map((f) => {
                      const tip = tips[f.id];
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-3 py-1.5 pr-4 pl-6 text-xs"
                        >
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {formatWeekdayTime(new Date(f.kickoff))}
                          </span>
                          <span className="flex-1 truncate">
                            {f.homeTeam} : {f.awayTeam}
                          </span>
                          {tip ? (
                            <span className="text-primary shrink-0 font-medium tabular-nums">
                              {tip.homeGoals} : {tip.awayGoals}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/70 shrink-0 italic">offen</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
