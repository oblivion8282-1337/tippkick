import Link from 'next/link';
import { CalendarClock, ChevronRight, Users } from 'lucide-react';

import {
  getCompetitionsOverview,
  getMatchdayTipMatrices,
  getTipperList,
  getTipperStats,
  getTipptagChronik,
  type MatchdayTipMatrix,
} from '@/lib/dashboard';
import { COMPETITION_LABELS, COMPETITION_ORDER, COMPETITION_SHORT, ROLE_ADMIN, ROLE_USER } from '@/lib/constants';
import { formatCountdown, formatDateTime } from '@/lib/datetime';
import { AdminSeasonPicker } from '@/components/admin-season-picker';
import { ConfirmButton } from '@/components/confirm-button';
import { CreateSeasonForm } from '@/components/create-season-form';
import { RoleSelectForm } from '@/components/role-select-form';
import { SubmitButton } from '@/components/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { TipptagRow } from '@/components/tipptag-row';
import { UserAvatar } from '@/components/user-avatar';
import { getSession } from '@/lib/session';
import { getManageableSeason, getSeasons } from '@/lib/matchdays';
import { approveUserAction, deleteUserAction, rejectUserAction } from '@/app/(admin)/admin/actions';
import type { CompetitionKey } from '@/generated/prisma/client';

/** Vorschau abgeschlossener Tipptage, bevor die Liste eingeklappt wird. */
const PAST_PREVIEW = 3;
/** Vorschau offener Tipptage — die Saison ist komplett importiert, sonst wäre die Liste endlos. */
const UPCOMING_PREVIEW = 3;

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; tab?: string; competition?: string }>;
}) {
  const { season: seasonParam, tab: tabParam, competition: competitionParam } = await searchParams;
  const seasons = await getSeasons();

  if (seasons.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Tippleitung" title="Admin" />
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground mb-4 text-sm">Noch keine Saison vorhanden.</p>
            <CreateSeasonForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Gewählte Saison (aus Query) oder die vom System vorgeschlagene.
  const season = seasons.find((s) => s.id === seasonParam) ?? (await getManageableSeason());
  if (!season) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Tippleitung" title="Admin" />
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground mb-4 text-sm">Noch keine Saison vorhanden.</p>
            <CreateSeasonForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [competitions, chronik, tipperStats, tippers, session] = await Promise.all([
    getCompetitionsOverview(season.id),
    getTipptagChronik(season.id),
    getTipperStats(),
    getTipperList(),
    getSession(),
  ]);
  const compByKey = new Map(competitions.map((c) => [c.key, c]));
  const selfId = session?.user.id;
  const pending = tippers.filter((u) => !u.approved);
  const active = tippers.filter((u) => u.approved);

  // Tab-Navigation (serverseitig per URL-Parameter, wie der Chronik-Filter).
  const tab: 'tipptage' | 'wettbewerbe' | 'tipper' =
    tabParam === 'wettbewerbe' || tabParam === 'tipper' ? tabParam : 'tipptage';
  // Chronik-Ansicht: pro Wettbewerb (Pills) — die Liste wäre bei BL+CL+DFB
  // (48+ Tipptage) sonst unbedienbar lang. Der Status-Filter (offen/abgeschlossen)
  // ist entfallen: offene stehen oben, abgeschlossene sind eingeklappt.
  type RowState = 'open' | 'running' | 'done';
  const allEntries = chronik.past
    .map((e) => ({ entry: e, state: 'done' as RowState }))
    .concat(chronik.running.map((e) => ({ entry: e, state: 'running' as RowState })))
    .concat(chronik.upcoming.map((e) => ({ entry: e, state: 'open' as RowState })));
  const availableKeys = COMPETITION_ORDER.filter((key) =>
    allEntries.some((e) => e.entry.competitionKey === key),
  );
  // Default: Bundesliga (Vereins-Hauptwettbewerb) — analog zum Dashboard-Hero.
  // Fallbacks: früheste offene Deadline, sonst der laufende, sonst der erste.
  const defaultKey =
    (availableKeys.includes('BL') ? ('BL' as CompetitionKey) : undefined) ??
    chronik.upcoming[0]?.competitionKey ??
    chronik.running[0]?.competitionKey ??
    availableKeys[0] ??
    'BL';
  const selectedKey: CompetitionKey = availableKeys.includes(competitionParam as CompetitionKey)
    ? (competitionParam as CompetitionKey)
    : defaultKey;
  const competitionHref = (key: CompetitionKey) =>
    `/admin?season=${season.id}&tab=tipptage${key === defaultKey ? '' : `&competition=${key}`}`;
  const openCountByKey = new Map<CompetitionKey, number>(
    availableKeys.map((key) => [key, chronik.upcoming.filter((e) => e.competitionKey === key).length]),
  );
  const entries = allEntries.filter((e) => e.entry.competitionKey === selectedKey);
  // Drei Phasen: läuft (Deadline vorbei, Ergebnisse fehlen noch), kommende
  // Tipptage (Deadline aufsteigend), abgeschlossen (alles beendet, neueste zuerst).
  const runningEntries = entries.filter((e) => e.state === 'running');
  const upcomingEntries = entries.filter((e) => e.state === 'open');
  const pastEntries = entries.filter((e) => e.state === 'done');
  const upcomingVisible = upcomingEntries.slice(0, UPCOMING_PREVIEW);
  const upcomingFolded = upcomingEntries.slice(UPCOMING_PREVIEW);
  const pastVisible = pastEntries.slice(0, PAST_PREVIEW);
  const pastFolded = pastEntries.slice(PAST_PREVIEW);
  // Tipp-Matrizen in einem Batch (2 Abfragen statt 2 pro Tipptag) — inkl. der
  // eingeklappten Zeilen, damit sie beim Aufklappen sofort Kennzahlen zeigen.
  const matrixByMatchday =
    tab === 'tipptage'
      ? await getMatchdayTipMatrices(entries.map((e) => e.entry.id))
      : new Map<string, MatchdayTipMatrix>();

  // Zeile eines Tipptags (offen/läuft/abgeschlossen) — Zusammenfassung serverseitig;
  // die Tipper-Matrix lädt die Zeile erst beim Aufklappen.
  const renderTipptagRow = (u: (typeof chronik.upcoming)[number], state: 'open' | 'running' | 'done') => {
    const matrix = matrixByMatchday.get(u.id) ?? { total: 0, fixtures: [], tipsByUser: new Map() };
    const tippersTipped = active.filter((t) => {
      const cnt = matrix.tipsByUser.get(t.id)?.size ?? 0;
      return matrix.total > 0 && cnt >= matrix.total;
    }).length;
    const openCount = active.length - tippersTipped;
    // Nur FINISHED zählt — Live-Zwischenstände sind kein Endergebnis.
    const resultsDone = matrix.fixtures.filter((f) => f.status === 'FINISHED').length;
    return (
      <TipptagRow
        key={u.id}
        matchdayId={u.id}
        competitionShort={COMPETITION_SHORT[u.competitionKey]}
        number={u.number}
        label={u.label}
        total={matrix.total}
        tippersTipped={tippersTipped}
        activeCount={active.length}
        openCount={openCount}
        deadlineLabel={formatDateTime(u.deadlineAt)}
        countdownLabel={state === 'open' ? formatCountdown(u.deadlineAt) : undefined}
        state={state}
        resultsDone={resultsDone}
      />
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tippleitung"
        title="Admin"
        description={`Saison ${season.name}`}
        actions={<AdminSeasonPicker seasons={seasons} activeId={season.id} />}
      />

      {/* Bereichs-Navigation uebernimmt die Admin-Sidebar (layout); der
          Warteschlangen-Hinweis der Tipper bleibt hier sichtbar. */}
      {tab === 'tipper' && pending.length > 0 && (
        <p className="bg-primary/10 text-primary rounded-lg px-4 py-2 text-sm font-medium">
          {pending.length} Tipper warten auf Freischaltung.
        </p>
      )}

      {tab === 'tipptage' && (
      <Card>
        <CardHeader className="border-border/40 flex-row flex-wrap items-center justify-between gap-3 border-b">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Tipptage
          </CardTitle>
          <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Wettbewerb wählen">
            {availableKeys.map((key) => {
              const open = openCountByKey.get(key) ?? 0;
              return (
                <Link
                  key={key}
                  href={competitionHref(key)}
                  aria-current={key === selectedKey ? 'page' : undefined}
                  className={
                    key === selectedKey
                      ? 'bg-primary text-primary-foreground flex items-center gap-1.5 rounded px-2.5 py-1 font-medium'
                      : 'text-muted-foreground hover:bg-muted flex items-center gap-1.5 rounded px-2.5 py-1'
                  }
                >
                  {COMPETITION_SHORT[key]}
                  {open > 0 && (
                    <span
                      className={
                        key === selectedKey
                          ? 'bg-primary-foreground/20 rounded-full px-1.5 py-0.5 text-[0.65rem] tabular-nums'
                          : 'bg-muted-foreground/15 rounded-full px-1.5 py-0.5 text-[0.65rem] tabular-nums'
                      }
                    >
                      {open}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {entries.length === 0 && (
            <p className="text-muted-foreground px-6 py-8 text-sm">
              {chronik.upcoming.length === 0 && chronik.running.length === 0 && chronik.past.length === 0 ? (
                <>
                  Noch keine Tipptage. Spieltage gruppieren?{' '}
                  <Link href="/admin/spieltage" className="text-primary underline">
                    Zur Gruppierung
                  </Link>
                </>
              ) : (
                `Keine Tipptage für ${COMPETITION_LABELS[selectedKey]}.`
              )}
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Läuft: eigene Karte — Deadline vorbei, Ergebnisse stehen (teilweise)
          noch aus. Erscheint nur, wenn gerade etwas läuft. */}
      {tab === 'tipptage' && runningEntries.length > 0 && (
        <Card>
          <CardHeader className="border-border/40 border-b">
            <CardTitle className="text-pitch flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <span className="bg-pitch h-1.5 w-1.5 animate-pulse rounded-full" aria-hidden="true" />
              Läuft · {runningEntries.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <div className="divide-border/40 divide-y">
              {runningEntries.map(({ entry: u, state }) => renderTipptagRow(u, state))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kommende Tipptage: eigene Karte — Deadline in der Zukunft. */}
      {tab === 'tipptage' && upcomingEntries.length > 0 && (
        <Card>
          <CardHeader className="border-border/40 border-b">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <CalendarClock className="text-muted-foreground h-4 w-4" />
              Kommende Tipptage · {upcomingEntries.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <div className="divide-border/40 divide-y">
              {upcomingVisible.map(({ entry: u, state }) => renderTipptagRow(u, state))}
            </div>
            {upcomingFolded.length > 0 && (
              <details className="border-border/40 border-t">
                <summary className="text-muted-foreground hover:bg-muted cursor-pointer select-none px-6 py-3 text-sm">
                  Weitere {upcomingFolded.length} offene Tipptage anzeigen
                </summary>
                <div className="divide-border/40 divide-y border-t border-border/40">
                  {upcomingFolded.map(({ entry: u, state }) => renderTipptagRow(u, state))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Abgeschlossen: eigene Karte — klare optische Trennung vom Offenen. */}
      {tab === 'tipptage' && pastEntries.length > 0 && (
        <Card>
          <CardHeader className="border-border/40 border-b">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <span className="bg-muted-foreground/40 h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              Abgeschlossen · {pastEntries.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <div className="divide-border/40 divide-y">
              {pastVisible.map(({ entry: u, state }) => renderTipptagRow(u, state))}
            </div>
            {pastFolded.length > 0 && (
              <details className="border-border/40 border-t">
                <summary className="text-muted-foreground hover:bg-muted cursor-pointer select-none px-6 py-3 text-sm">
                  Weitere {pastFolded.length} abgeschlossene Tipptage anzeigen
                </summary>
                <div className="divide-border/40 divide-y border-t border-border/40">
                  {pastFolded.map(({ entry: u, state }) => renderTipptagRow(u, state))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wettbewerbe */}
      {tab === 'wettbewerbe' && (
      <Card>
        <CardHeader className="border-border/40 border-b">
          <CardTitle>Wettbewerbe</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <ul className="divide-border/40 divide-y">
            {COMPETITION_ORDER.map((key) => {
              const c = compByKey.get(key);
              const active = Boolean(c && c.sourceShortcuts.length > 0);
              return (
                <li key={key} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                  <span className="font-medium">{COMPETITION_LABELS[key]}</span>
                  {active && c ? (
                    <>
                      <span className="text-muted-foreground tabular-nums">
                        {c._count.matchdays} Tipptage · {c._count.sections} Spieltage importiert
                      </span>
                      <LinkButton
                        href={`/admin/spieltage?season=${season.id}&competition=${c.id}`}
                        size="icon-sm"
                        className="ml-auto"
                        aria-label={`${COMPETITION_LABELS[key]} öffnen`}
                      >
                        <ChevronRight className="size-4" />
                      </LinkButton>
                    </>
                  ) : (
                    <span className="text-muted-foreground ml-auto text-xs">{c ? 'ohne Quelle' : 'deaktiviert'}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      )}

      {/* Tipper */}
      {tab === 'tipper' && (
      <Card>
        <CardHeader className="border-border/40 border-b">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Tipper · {tipperStats.tippers} (+{tipperStats.admins} Tippleitung)
            {pending.length > 0 && (
              <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                {pending.length} wartet
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {pending.length > 0 && (
            <>
              <p className="text-muted-foreground px-6 py-2 text-xs font-medium tracking-wide uppercase">
                Wartet auf Freischaltung
              </p>
              <ul className="divide-border/40 border-border/40 divide-y border-t">
                {pending.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground truncate">{u.email}</span>
                    <span className="ml-auto flex gap-2">
                      <form action={approveUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <SubmitButton size="sm" pendingText="Schalte frei …">
                          Freischalten
                        </SubmitButton>
                      </form>
                      <form action={rejectUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <ConfirmButton confirm={`${u.name} ablehnen und löschen?`} variant="destructive" size="sm">
                          Ablehnen
                        </ConfirmButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {active.length === 0 ? (
            <p className="text-muted-foreground px-6 py-8 text-sm">Noch keine Tipper freigeschaltet.</p>
          ) : (
            <ul className="divide-border/40 border-border/40 divide-y border-t">
              {active.map((u) => {
                const isAdmin = u.role === ROLE_ADMIN;
                const isSelf = u.id === selfId;
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                    <UserAvatar name={u.name} image={u.image} className="h-7 w-7 text-xs" />
                    <span className="font-medium">
                      {u.name}
                      {isSelf && <span className="text-muted-foreground ml-1 text-xs">(du)</span>}
                    </span>
                    <span className="text-muted-foreground truncate">{u.email}</span>
                    {isSelf ? (
                      <span
                        className={
                          isAdmin
                            ? 'bg-primary/15 text-primary ml-auto rounded px-2 py-0.5 text-xs font-medium'
                            : 'bg-muted text-muted-foreground ml-auto rounded px-2 py-0.5 text-xs'
                        }
                      >
                        {isAdmin ? 'Tippleitung' : 'Tipper'}
                      </span>
                    ) : (
                      <span className="ml-auto flex items-center gap-2">
                        <RoleSelectForm userId={u.id} role={u.role ?? ROLE_USER} />
                        <form action={deleteUserAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <ConfirmButton
                            confirm={`${u.name} endgültig entfernen (inkl. Tipps)?`}
                            variant="destructive"
                            size="sm"
                          >
                            Entfernen
                          </ConfirmButton>
                        </form>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
