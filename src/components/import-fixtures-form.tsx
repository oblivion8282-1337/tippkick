'use client';

import { useActionState, useRef, useState } from 'react';

import { importFixturesAction, importSeasonAction } from '@/app/(admin)/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Competition = { id: string; name: string; sourceShortcut: string | null };

const initialState = { ok: false, message: '' };

export function ImportFixturesForm({ competitions }: { competitions: Competition[] }) {
  const importable = competitions.filter((c) => c.sourceShortcut);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [seasonPending, setSeasonPending] = useState(false);

  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await importFixturesAction(formData);
    return result;
  }, initialState);

  async function onImportSeason() {
    const competitionId = selectRef.current?.value;
    if (!competitionId) {
      return;
    }
    setSeasonPending(true);
    setSeasonMsg(null);
    const result = await importSeasonAction(competitionId);
    setSeasonPending(false);
    setSeasonMsg(result.message);
  }

  if (importable.length === 0) {
    return <p className="text-muted-foreground text-sm">Keine Wettbewerbe mit OpenLigaDB-Quelle vorhanden.</p>;
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="competitionId">Wettbewerb</Label>
          <select
            id="competitionId"
            name="competitionId"
            ref={selectRef}
            defaultValue={importable[0].id}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          >
            {importable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="matchdayNumber">Spieltag (Nr.)</Label>
          <Input id="matchdayNumber" name="matchdayNumber" type="number" min={1} defaultValue={1} className="w-24" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Lade …' : 'Spieltag laden'}
        </Button>
        <Button type="button" variant="outline" onClick={onImportSeason} disabled={seasonPending}>
          {seasonPending ? 'Lade …' : 'Ganze Saison laden'}
        </Button>
      </form>
      {(state.message || seasonMsg) && (
        <p
          className={
            state.ok || seasonMsg?.includes('importiert') ? 'text-primary text-sm' : 'text-destructive text-sm'
          }
        >
          {seasonMsg ?? state.message}
        </p>
      )}
    </div>
  );
}
