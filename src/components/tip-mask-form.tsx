'use client';

import { useMemo, useRef, useState } from 'react';

import { saveTipAction } from '@/app/(app)/tippen/actions';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Fixture = { id: string; league: 'BL' | 'L2'; homeTeam: string; awayTeam: string };

type Props = {
  fixtures: Fixture[];
  existingTips: Record<string, { homeGoals: number; awayGoals: number }>;
  open: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const DEBOUNCE_MS = 500;

export function TipMaskForm({ fixtures, existingTips, open }: Props) {
  // Werte als Strings (leere Eingabe = noch nicht getippt).
  const [values, setValues] = useState<Record<string, { home: string; away: string }>>(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const f of fixtures) {
      const existing = existingTips[f.id];
      init[f.id] = {
        home: existing ? String(existing.homeGoals) : '',
        away: existing ? String(existing.awayGoals) : '',
      };
    }
    return init;
  });

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const tippedCount = useMemo(
    () => fixtures.filter((f) => isFilled(values[f.id]?.home) && isFilled(values[f.id]?.away)).length,
    [fixtures, values],
  );

  function handleChange(fixtureId: string, side: 'home' | 'away', raw: string) {
    const next = sanitize(raw);
    const prev = values[fixtureId] ?? { home: '', away: '' };
    const updated = side === 'home' ? { home: next, away: prev.away } : { home: prev.home, away: next };
    setValues((prevValues) => ({ ...prevValues, [fixtureId]: updated }));

    if (!open) {
      return; // nach Deadline keine Saves
    }

    setSaveState('saving');
    clearTimeout(timers.current[fixtureId]);
    timers.current[fixtureId] = setTimeout(() => {
      void persist(fixtureId, updated);
    }, DEBOUNCE_MS);
  }

  async function persist(fixtureId: string, vals: { home: string; away: string }) {
    const result = await saveTipAction({
      fixtureId,
      homeGoals: vals.home === '' ? 0 : Number(vals.home),
      awayGoals: vals.away === '' ? 0 : Number(vals.away),
    });
    setSaveState(result.ok ? 'saved' : 'error');
  }

  const grouped = useMemo(() => groupByLeague(fixtures), [fixtures]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {tippedCount} / {fixtures.length} getippt
        </span>
        <SaveBadge state={saveState} />
      </div>

      {grouped.map(({ league, items }) => (
        <section key={league} className="space-y-2">
          <h2 className="font-medium">{league === 'BL' ? '1. Liga' : '2. Liga'}</h2>
          <div className="overflow-hidden rounded-lg border">
            {items.map((f) => (
              <FixtureRow
                key={f.id}
                fixture={f}
                home={values[f.id]?.home ?? ''}
                away={values[f.id]?.away ?? ''}
                disabled={!open}
                onChange={(side, v) => handleChange(f.id, side, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {!open && (
        <p className="text-destructive text-sm">
          Die Deadline ist abgelaufen – Tipps können nicht mehr geändert werden.
        </p>
      )}
    </div>
  );
}

function FixtureRow({
  fixture,
  home,
  away,
  disabled,
  onChange,
}: {
  fixture: Fixture;
  home: string;
  away: string;
  disabled: boolean;
  onChange: (side: 'home' | 'away', value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
      <span className="flex-1 text-right text-sm">{fixture.homeTeam}</span>
      <TipInput value={home} disabled={disabled} onChange={(v) => onChange('home', v)} />
      <span className="text-muted-foreground">:</span>
      <TipInput value={away} disabled={disabled} onChange={(v) => onChange('away', v)} />
      <span className="flex-1 text-sm">{fixture.awayTeam}</span>
    </div>
  );
}

function TipInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 text-center"
    />
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  return (
    <span
      className={cn(
        'text-sm',
        state === 'saving' && 'text-muted-foreground',
        state === 'saved' && 'text-primary',
        state === 'error' && 'text-destructive',
      )}
    >
      {state === 'saving' && 'speichert …'}
      {state === 'saved' && 'gespeichert'}
      {state === 'error' && 'Fehler beim Speichern'}
    </span>
  );
}

function groupByLeague(fixtures: Fixture[]) {
  const leagues: Array<'BL' | 'L2'> = ['BL', 'L2'];
  return leagues
    .map((league) => ({ league, items: fixtures.filter((f) => f.league === league) }))
    .filter((g) => g.items.length > 0);
}

function isFilled(v: string | undefined): boolean {
  return v !== undefined && v !== '';
}

function sanitize(raw: string): string {
  if (raw === '') {
    return '';
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    return '';
  }
  return String(Math.min(99, Math.max(0, n)));
}
