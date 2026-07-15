'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';

import { importFixturesAction } from '@/app/(admin)/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Competition = { id: string; name: string; sourceShortcut: string | null };

const initialState = { ok: false, message: '' };

export function ImportFixturesForm({ competitions }: { competitions: Competition[] }) {
  const router = useRouter();
  const importable = competitions.filter((c) => c.sourceShortcut);

  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await importFixturesAction(formData);
    if (result.ok && result.matchdayId) {
      router.push(`/admin/matchdays/${result.matchdayId}`);
    }
    return result;
  }, initialState);

  if (importable.length === 0) {
    return <p className="text-muted-foreground text-sm">Keine Wettbewerbe mit OpenLigaDB-Quelle vorhanden.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="competitionId">Wettbewerb</Label>
        <select
          id="competitionId"
          name="competitionId"
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
        {pending ? 'Lade …' : 'Aus OpenLigaDB laden'}
      </Button>
      {state.message && (
        <span className={state.ok ? 'text-primary text-sm' : 'text-destructive text-sm'}>{state.message}</span>
      )}
    </form>
  );
}
