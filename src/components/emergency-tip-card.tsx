import { LifeBuoy, Plus, Trash2 } from 'lucide-react';

import type { EmergencyConfig } from '@/lib/emergency-tip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

          {/* Formular eingeklappt: nur ein Button, kein leeres Formular-Gerüst. */}
          <details className="group">
            <summary className="w-fit list-none [&::-webkit-details-marker]:hidden">
              <span className="border-border text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <Plus className="h-4 w-4" />
                Weitere Sonderregel hinzufügen
              </span>
            </summary>
            <form action={addEmergencyRuleAction} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="teamName">Mannschaft</Label>
                <select
                  id="teamName"
                  name="teamName"
                  required
                  className="border-input bg-background h-9 min-w-52 rounded-md border px-3 text-sm"
                >
                  {teams.map((t) => (
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
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
