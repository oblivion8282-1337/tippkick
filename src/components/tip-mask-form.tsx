'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { League } from '@/generated/prisma/client';

import { saveTipAction } from '@/app/(app)/tippen/actions';
import { Input } from '@/components/ui/input';
import { LEAGUE_SECTION_LABELS, LEAGUE_SECTION_ORDER, MAX_GOALS, MIN_GOALS } from '@/lib/constants';
import type { TipFailureReason } from '@/lib/tipps';
import { cn } from '@/lib/utils';

export type TipSectionFixture = { id: string; homeTeam: string; awayTeam: string };
export type TipSection = { league: League | null; number: number; fixtures: TipSectionFixture[] };

type Props = {
  sections: TipSection[];
  existingTips: Record<string, { homeGoals: number; awayGoals: number }>;
  open: boolean;
};

/** Grund des Fehlschlags differenziert: User sieht nicht nur "Fehler", sondern warum. */
type SaveState = 'idle' | 'saving' | 'saved' | { error: TipFailureReason };
const DEBOUNCE_MS = 500;

/** Lesbare Meldung je Grund – vermeidet generisches "Fehler". */
const REASON_MESSAGE: Record<TipFailureReason, string> = {
  unauth: 'Sitzung abgelaufen – bitte neu einloggen.',
  deadline: 'Deadline überschritten – Tipps können nicht mehr geändert werden.',
  invalid: 'Partie nicht gefunden oder noch keinem Tipptag zugeordnet.',
  unapproved: 'Noch nicht freigeschaltet – bitte warten bis die Tippleitung deinen Account freigibt.',
  banned: 'Dein Account ist gesperrt.',
  closed: 'Diese Partie wurde abgesagt oder verlegt – Tipps nicht möglich.',
  error: 'Speichern fehlgeschlagen – bitte erneut versuchen.',
};

export function TipMaskForm({ sections, existingTips, open }: Props) {
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
  const mounted = useRef(true);

  // Debounce-Timer beim Unmount abräumen, sonst läuft persist() nach Navigation
  // weiter und feuert setState auf einer unmounted Komponente.
  useEffect(() => {
    mounted.current = true;
    const timersRef = timers.current;
    return () => {
      mounted.current = false;
      for (const id of Object.keys(timersRef)) {
        clearTimeout(timersRef[id]);
      }
    };
  }, []);

  const tippedCount = useMemo(
    () => allFixtures.filter((f) => isFilled(values[f.id]?.home) && isFilled(values[f.id]?.away)).length,
    [allFixtures, values],
  );

  function handleChange(fixtureId: string, side: 'home' | 'away', raw: string) {
    const next = sanitize(raw);
    const prev = values[fixtureId] ?? { home: '', away: '' };
    const updated = side === 'home' ? { home: next, away: prev.away } : { home: prev.home, away: next };
    setValues((prevValues) => ({ ...prevValues, [fixtureId]: updated }));

    if (!open) {
      return;
    }

    clearTimeout(timers.current[fixtureId]);
    // Nur persistieren, wenn BEIDE Felder gefüllt sind – ein leeres Feld ist
    // "noch nicht getippt" (oder gerade gelöscht), kein valides 0:0.
    if (updated.home === '' || updated.away === '') {
      setSaveState('idle');
      return;
    }
    setSaveState('saving');
    timers.current[fixtureId] = setTimeout(() => {
      void persist(fixtureId, updated);
    }, DEBOUNCE_MS);
  }

  async function persist(fixtureId: string, vals: { home: string; away: string }) {
    if (!mounted.current) {
      return;
    }
    const result = await saveTipAction({
      fixtureId,
      homeGoals: Number(vals.home),
      awayGoals: Number(vals.away),
    });
    if (!mounted.current) {
      return;
    }
    if (result.ok) {
      setSaveState('saved');
      return;
    }
    setSaveState({ error: result.reason });
  }

  // Sortiere Sections: Single-Liga zuerst (league=null), dann BL, dann L2.
  const orderedSections = useMemo(() => {
    const sortKey = (s: TipSection): number => {
      if (s.league === null) {
        return 0;
      }
      const idx = LEAGUE_SECTION_ORDER.indexOf(s.league);
      return idx + 1;
    };
    return [...sections].sort((a, b) => sortKey(a) - sortKey(b));
  }, [sections]);

  return (
    <div className="space-y-6">
      <SaveBadgeBar tippedCount={tippedCount} total={allFixtures.length} state={saveState} />

      <div className="space-y-8">
        {orderedSections.map((section, sectionIndex) => (
          <LigaSection
            key={`${section.league ?? 'none'}-${section.number}`}
            section={section}
            first={sectionIndex === 0}
            values={values}
            onChange={handleChange}
            disabled={!open}
          />
        ))}
      </div>

      {!open && (
        <p className="text-muted-foreground border-border/60 bg-muted/40 rounded-lg border px-4 py-3 text-sm">
          Die Deadline ist abgelaufen — Tipps können nicht mehr geändert werden.
        </p>
      )}
    </div>
  );
}

/** Eine Liga-Sektion (z. B. „1. Liga · 1. Spieltag") als klar abgegrenzter Block. */
function LigaSection({
  section,
  first,
  values,
  onChange,
  disabled,
}: {
  section: TipSection;
  first: boolean;
  values: Record<string, { home: string; away: string }>;
  onChange: (fixtureId: string, side: 'home' | 'away', raw: string) => void;
  disabled: boolean;
}) {
  const title = section.league ? LEAGUE_SECTION_LABELS[section.league] : 'Wettbewerb';
  return (
    <section className="relative">
      {/* Pitch-Green Akzentstreifen links — Signatur des Designs. */}
      <div aria-hidden="true" className="pitch-bar absolute top-2 bottom-2 left-0 w-1 rounded-full" />
      <div className="pl-5 sm:pl-7">
        <header className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
            <span className="text-muted-foreground font-display ml-3 text-2xl font-normal sm:text-3xl">
              · {section.number}. Spieltag
            </span>
          </h2>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {section.fixtures.length} {section.fixtures.length === 1 ? 'Partie' : 'Partien'}
          </span>
        </header>

        <div className="bg-card ring-foreground/8 overflow-hidden rounded-2xl shadow-[0_1px_0_oklch(0.21_0.018_160/0.04),0_8px_24px_-12px_oklch(0.21_0.018_160/0.12)] ring-1 dark:shadow-[0_1px_0_oklch(0.93_0.01_100/0.04),0_8px_24px_-12px_oklch(0_0_0/0.4)]">
          {section.fixtures.map((fixture, index) => (
            <FixtureRow
              key={fixture.id}
              fixture={fixture}
              home={values[fixture.id]?.home ?? ''}
              away={values[fixture.id]?.away ?? ''}
              disabled={disabled}
              striped={!first && index % 2 === 0}
              onChange={(side, v) => onChange(fixture.id, side, v)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Eine einzelne Partie: Heim — Tipp-Heim : Tipp-Gast — Gast. Tipp-Zahlen in Mono. */
function FixtureRow({
  fixture,
  home,
  away,
  disabled,
  striped,
  onChange,
}: {
  fixture: TipSectionFixture;
  home: string;
  away: string;
  disabled: boolean;
  striped: boolean;
  onChange: (side: 'home' | 'away', value: string) => void;
}) {
  const complete = isFilled(home) && isFilled(away);
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 sm:gap-4 sm:px-6 sm:py-3.5',
        striped && 'bg-muted/30',
        complete && 'bg-pitch/[0.06] dark:bg-pitch/[0.08]',
      )}
    >
      <span className="truncate text-right text-base font-medium sm:text-lg">{fixture.homeTeam}</span>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <TipInput
          value={home}
          disabled={disabled}
          placeholder="–"
          onChange={(v) => onChange('home', v)}
          aria-label={`Tipp ${fixture.homeTeam}`}
        />
        <span className="text-muted-foreground font-mono text-base font-light select-none">:</span>
        <TipInput
          value={away}
          disabled={disabled}
          placeholder="–"
          onChange={(v) => onChange('away', v)}
          aria-label={`Tipp ${fixture.awayTeam}`}
        />
      </div>
      <span className="truncate text-base font-medium sm:text-lg">{fixture.awayTeam}</span>
    </div>
  );
}

function TipInput({
  value,
  disabled,
  placeholder,
  onChange,
  ...rest
}: {
  value: string;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={MIN_GOALS}
      max={MAX_GOALS}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      // Nur Ziffern 0-9 durchlassen. Verhindert dass Tipper '1.5' oder 'abc'
      // eintippt, was onChange dann stillschweigend verwirft.
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      className="bg-muted/60 hover:bg-muted focus-visible:bg-background w-12 border-transparent text-center font-mono text-base font-medium tabular-nums shadow-none transition-colors sm:w-14 sm:text-lg"
      aria-label={rest['aria-label']}
    />
  );
}

function SaveBadgeBar({ tippedCount, total, state }: { tippedCount: number; total: number; state: SaveState }) {
  const ratio = total === 0 ? 0 : tippedCount / total;
  return (
    <div className="border-border/40 bg-card/50 flex items-center justify-between rounded-2xl border px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl font-semibold tabular-nums">
          {tippedCount}
          <span className="text-muted-foreground">/{total}</span>
        </span>
        <span className="text-muted-foreground text-sm">getippt</span>
        <div className="bg-muted ml-2 hidden h-1.5 w-24 overflow-hidden rounded-full sm:block" aria-hidden="true">
          <div
            className="bg-pitch h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>
      <SaveBadge state={state} />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (typeof state === 'object') {
    return (
      <span
        role="status"
        aria-live="polite"
        title={REASON_MESSAGE[state.error]}
        className="text-destructive flex items-center gap-1.5 font-mono text-xs tracking-wider uppercase"
      >
        <Cross />
        {REASON_MESSAGE[state.error]}
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 font-mono text-xs tracking-wider uppercase',
        state === 'saving' && 'text-muted-foreground',
        state === 'saved' && 'text-pitch',
        state === 'idle' && 'text-muted-foreground/70',
      )}
    >
      {state === 'saving' && (
        <>
          <Spinner />
          speichert …
        </>
      )}
      {state === 'saved' && (
        <>
          <Check />
          gespeichert
        </>
      )}
      {state === 'idle' && (
        <>
          <Pencil />
          offen
        </>
      )}
    </span>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M22 12 A10 10 0 0 0 12 2" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function Check() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Cross() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  );
}
function Pencil() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
