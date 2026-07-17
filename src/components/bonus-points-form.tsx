'use client';

import { useTransition } from 'react';
import { Check } from 'lucide-react';

import { saveBonusAction } from '@/app/(admin)/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Kompakte Eingabe der Zusatzpunkte (ZP) pro Tipper im TW-Blatt. Speichern per
 * Server Action; revalidiert die Auswertungs-Seite.
 */
export function BonusPointsForm(input: { matchdayId: string; userId: string; bonusPts: number }) {
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    start(() => saveBonusAction(formData));
  }

  return (
    <form action={submit} className="flex items-center gap-1">
      <input type="hidden" name="matchdayId" value={input.matchdayId} />
      <input type="hidden" name="userId" value={input.userId} />
      <Input
        name="bonusPts"
        type="number"
        min={0}
        max={99}
        inputMode="numeric"
        defaultValue={input.bonusPts}
        className="h-8 w-12 text-center tabular-nums"
        aria-label="Zusatzpunkte"
      />
      <Button type="submit" size="icon-sm" variant="ghost" disabled={pending} aria-label="Zusatzpunkte speichern">
        <Check />
      </Button>
    </form>
  );
}
