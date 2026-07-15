'use client';

import { useTransition } from 'react';
import { Check } from 'lucide-react';

import { saveResultAction } from '@/app/(admin)/admin/actions';
import { FIXTURE_STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUS_OPTIONS = Object.entries(FIXTURE_STATUS_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Kompakte Ergebnis-Eingabe pro Partie (Tore + Status). Speichern markiert die
 * Partie als MANUAL → ein OpenLigaDB-Re-Sync überschreibt sie nicht.
 */
export function FixtureResultForm(input: {
  fixtureId: string;
  matchdayId: string;
  home: number | null;
  away: number | null;
  status: string;
  source: string;
}) {
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    start(() => saveResultAction(formData));
  }

  return (
    <form action={submit} className="flex items-center gap-1">
      <input type="hidden" name="fixtureId" value={input.fixtureId} />
      <input type="hidden" name="matchdayId" value={input.matchdayId} />
      <Input
        name="homeGoals"
        type="number"
        min={0}
        inputMode="numeric"
        defaultValue={input.home ?? ''}
        className="h-8 w-12 text-center tabular-nums"
        aria-label="Tore Heim"
      />
      <span className="text-muted-foreground">:</span>
      <Input
        name="awayGoals"
        type="number"
        min={0}
        inputMode="numeric"
        defaultValue={input.away ?? ''}
        className="h-8 w-12 text-center tabular-nums"
        aria-label="Tore Gast"
      />
      <select
        name="status"
        defaultValue={input.status}
        className="border-input bg-background h-8 rounded-md border px-1 text-xs"
        aria-label="Status"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="icon-sm" variant="ghost" disabled={pending} aria-label="Ergebnis speichern">
        <Check />
      </Button>
      {input.source === 'MANUAL' && <span className="text-muted-foreground ml-1 text-xs">manuell</span>}
      {input.source === 'SYNC' && <span className="text-muted-foreground ml-1 text-xs">sync</span>}
    </form>
  );
}
