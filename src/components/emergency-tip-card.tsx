'use client';

import { useState } from 'react';
import { LifeBuoy, Plus, Trash2 } from 'lucide-react';

import type { EmergencyConfig } from '@/lib/emergency-tip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/confirm-button';
import { SubmitButton } from '@/components/submit-button';
import {
  addEmergencyRuleAction,
  deleteEmergencyRuleAction,
  saveEmergencyDefaultAction,
} from '@/app/(app)/einstellungen/actions';

/**
 * Notfalltipp-Verwaltung: Grund-Standardergebnis + Sonderregeln pro Mannschaft.
 * Reine Formular-Schicht — Logik (Anwendung, Auflösung) liegt in lib/emergency-tip.
 */
export function EmergencyTipCard({ emergency, teams }: { emergency: EmergencyConfig | null; teams: string[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="text-pitch h-4 w-4" />
            Grundregel
          </CardTitle>
          <CardDescription>
            Gilt für jede Partie, die du nicht rechtzeitig getippt hast — die Deadline bleibt
            davon unberührt. In der Auswertung erscheint der Ersatz gekennzeichnet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveEmergencyDefaultAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="defaultHome">Standard-Ergebnis (Heim : Gast)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="defaultHome"
                  name="defaultHome"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={emergency?.defaultHome ?? 2}
                  className="w-20"
                  required
                />
                <span className="text-muted-foreground">:</span>
                <Input
                  name="defaultAway"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={emergency?.defaultAway ?? 1}
                  className="w-20"
                  required
                />
              </div>
            </div>
            <SubmitButton size="sm">Speichern</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sonderregeln</CardTitle>
          <CardDescription>
            Eine Mannschaft gewinnt immer mit diesem Ergebnis — egal ob Heim- oder Auswärtsspiel
            (auswärts automatisch gespiegelt). Überschreibt die Grundregel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emergency && emergency.rules.length > 0 ? (
            <ul className="divide-border/40 divide-y">
              {emergency.rules.map((r) => (
                <li key={r.teamName} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.teamName}</span>
                  <span className="tabular-nums">
                    gewinnt {r.goalsFor} : {r.goalsAgainst}
                  </span>
                  <form action={deleteEmergencyRuleAction}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <ConfirmButton confirm={`Sonderregel für ${r.teamName} löschen?`} variant="ghost" size="icon-sm">
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Noch keine Sonderregeln.</p>
          )}

          <EmergencyRuleForm teams={teams} usedTeams={new Set((emergency?.rules ?? []).map((r) => r.teamName))} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Eingabefelder für eine neue Sonderregel. Felder erscheinen ÜBER dem
 * „Weitere … hinzufügen“-Button (der bleibt immer ganz unten) und verschwinden
 * nach dem Hinzufügen bzw. Abbrechen wieder.
 */
function EmergencyRuleForm({ teams, usedTeams }: { teams: string[]; usedTeams: Set<string> }) {
  const [open, setOpen] = useState(false);
  // Bereits geregelte Mannschaften ausblenden — pro Team genau eine Regel.
  const available = teams.filter((t) => !usedTeams.has(t));
  if (available.length === 0) {
    return <p className="text-muted-foreground text-sm">Für jede Mannschaft gibt es bereits eine Sonderregel.</p>;
  }

  async function onSubmit(formData: FormData) {
    await addEmergencyRuleAction(formData);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      {open && (
        <form action={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="teamName">Mannschaft</Label>
            <select
              id="teamName"
              name="teamName"
              required
              className="border-input bg-background h-9 min-w-52 rounded-md border px-3 text-sm"
            >
              {available.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goalsFor">gewinnt (Für : Gegen)</Label>
            <div className="flex items-center gap-2">
              <Input id="goalsFor" name="goalsFor" type="number" min={0} max={99} defaultValue={4} className="w-20" required />
              <span className="text-muted-foreground">:</span>
              <Input name="goalsAgainst" type="number" min={0} max={99} defaultValue={0} className="w-20" required />
            </div>
          </div>
          <SubmitButton size="sm" variant="outline">
            Hinzufügen
          </SubmitButton>
        </form>
      )}
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
        <Plus className="h-4 w-4" />
        {open ? 'Abbrechen' : 'Weitere Sonderregel hinzufügen'}
      </Button>
    </div>
  );
}
