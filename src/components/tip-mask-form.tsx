'use client';

import { useMemo, useRef, useState } from 'react';

import type { League } from '@/generated/prisma/client';

import { saveTipAction } from '@/app/(app)/tippen/actions';
import { Input } from '@/components/ui/input';
import {
  LEAGUE_SECTION_LABELS,
  LEAGUE_SECTION_ORDER,
  MAX_GOALS,
  MIN_GOALS,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

export type TipSectionFixture = { id: string; homeTeam: string; awayTeam: string };
export type TipSection = { league: League | null; number: number; fixtures: TipSectionFixture[] };

type Props = {
  sections: TipSection[];
  existingTips: Record<string, { homeGoals: number; awayGoals: number }>;
  open: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const DEBOUNCE_MS = 500;

export function TipMaskForm({ sections, existingTips, open }: Props) {
  // Flache Liste aller Fixtures (für State + Zähler) – behält Reihenfolge der Sektionen bei.
  const allFixtures = useMemo(() => sections.flatMap((s) => s.fixtures), [sections]);

  const [values, setValues] = useState<Record<string, { home: string; away: string }>>(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const f of allFixtures) {
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
    () =>
      allFixtures.filter((f) => isFilled(values[f.id]?.home) && isFilled(values[f.id]?.away)).length,
    [allFixtures, values],
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

  // Sortiere Sections: Single-Liga zuerst (league=null), dann BL, dann L2.
  const orderedSections = useMemo(
    () =>
      [...sections].sort((a, b) => {
        const ka = a.league === null ? 0 : LEAGUE_SECTION_ORDER.indexOf(a.league) + 1;
        const kb = b.league === null ? 0 : LEAGUE_SECTION_ORDER.indexOf(b.league) + 1;
        return ka - kb;
      }),
    [sections],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {tippedCount} / {allFixtures.length} getippt
        </span>
        <SaveBadge state={saveState} />
      </div>

      <div className="space-y-6">
        {orderedSections.map((section) => (
          <section key={`${section.league ?? 'none'}-${section.number}`} className="space-y-2">
            <h2 className="font-medium">
              {section.league ? LEAGUE_SECTION_LABELS[section.league] : 'Wettbewerb'} · {section.number}. Spieltag
            </h2>
            <div className="overflow-hidden rounded-lg border">
              {section.fixtures.map((f) => (
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
      </div>

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
  fixture: TipSectionFixture;
  home: string;
  away: string;
  disabled: boolean;
  onChange: (side: 'home' | 'away', value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <span className="flex-1 text-right text-base">{fixture.homeTeam}</span>
      <TipInput value={home} disabled={disabled} onChange={(v) => onChange('home', v)} />
      <span className="text-muted-foreground">:</span>
      <TipInput value={away} disabled={disabled} onChange={(v) => onChange('away', v)} />
      <span className="flex-1 text-base">{fixture.awayTeam}</span>
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
      min={MIN_GOALS}
      max={MAX_GOALS}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 text-center text-base"
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
  return String(Math.min(MAX_GOALS, Math.max(MIN_GOALS, n)));
}