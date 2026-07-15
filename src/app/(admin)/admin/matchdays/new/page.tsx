import { createMatchdayAction } from '@/app/(admin)/admin/actions';
import { getCompetitionsAdmin } from '@/lib/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';

export default async function NewMatchdayPage() {
  const competitions = await getCompetitionsAdmin();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tippleitung"
        title="Spieltag anlegen"
        description="Manuell anlegen — Partien kannst du auf der Detailseite ergänzen."
      />

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent>
          {competitions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Es gibt noch keine Wettbewerbe. Lege zuerst Wettbewerbe an (z. B. per Seed).
            </p>
          ) : (
            <form action={createMatchdayAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="competitionId">Wettbewerb</Label>
                <select
                  id="competitionId"
                  name="competitionId"
                  defaultValue={competitions[0].id}
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-lg border px-3 text-sm shadow-sm outline-none focus-visible:ring-4"
                  required
                >
                  {competitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Tipptag (Nr.)" name="number" type="number" defaultValue="1" />
              <Field label="Startdatum" name="startDate" type="date" />
              <Field label="Enddatum" name="endDate" type="date" />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="deadlineAt">Deadline (Tippschluss)</Label>
                <Input id="deadlineAt" name="deadlineAt" type="datetime-local" required />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Anlegen</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required />
    </div>
  );
}