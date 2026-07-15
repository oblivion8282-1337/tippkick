import { createMatchdayAction } from '@/app/(admin)/admin/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewMatchdayPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Spieltag anlegen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createMatchdayAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Saison" name="seasonName" defaultValue="25/26" />
            <Field label="Spieltag (Nr.)" name="number" type="number" defaultValue="34" />
            <Field label="Startdatum" name="startDate" type="date" />
            <Field label="Enddatum" name="endDate" type="date" />
            <Field label="Deadline (Tippschluss)" name="deadlineAt" type="datetime-local" />
            <div className="sm:col-span-2">
              <Button type="submit">Anlegen & Partien erfassen</Button>
            </div>
          </form>
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
