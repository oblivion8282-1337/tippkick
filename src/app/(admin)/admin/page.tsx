import Link from 'next/link';

import { getMatchdays } from '@/lib/matchdays';
import { Button } from '@/components/ui/button';

export default async function AdminHomePage() {
  const matchdays = await getMatchdays();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Spieltage</h1>
        <Button render={<Link href="/admin/matchdays/new" />}>Neuer Spieltag</Button>
      </div>

      {matchdays.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Spieltage angelegt.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {matchdays.map((md) => (
            <li key={md.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium">
                  {md.number}. Spieltag
                  {md.isActive && <span className="text-primary ml-2 text-sm">(aktiv)</span>}
                </span>
                <span className="text-muted-foreground ml-2 text-sm">{md.season.name}</span>
              </div>
              <Button variant="outline" size="sm" render={<Link href={`/admin/matchdays/${md.id}`} />}>
                {md._count.fixtures} Partien →
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
