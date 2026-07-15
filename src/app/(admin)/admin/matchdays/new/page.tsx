import { createMatchdayAction } from '@/app/(admin)/admin/actions';
import { getCompetitionsAdmin } from '@/lib/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function NewMatchdayPage() {
  const competitions = await getCompetitionsAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Spieltag anlegen</h1>
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="competitionId">Wettbewerb</Label>
                <select
                  id="competitionId"
                  name="competitionId"
                  defaultValue={competitions[0].id}
                  className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                  required
                >
                  {competitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Spieltag (Nr.)" name="number" type="number" defaultValue="1" />
              <Field label="Startdatum" name="startDate" type="date" />
              <Field label="Enddatum" name="endDate" type="date" />
              <Field label="Deadline (Tippschluss)" name="deadlineAt" type="datetime-local" />
              <div className="sm:col-span-2">
                <Button type="submit">Anlegen & Partien erfassen</Button>
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
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required />
    </div>
  );
}
