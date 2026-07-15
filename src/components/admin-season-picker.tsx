'use client';

import { useRouter } from 'next/navigation';

import { CreateSeasonForm } from '@/components/create-season-form';

/**
 * Saison-Auswahl fürs Admin-Dashboard: Dropdown wechselt die Saison per
 * ?season=-Query (zurück in alte Saisons springen); „Neue Saison" legt eine an.
 */
export function AdminSeasonPicker({
  seasons,
  activeId,
}: {
  seasons: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={activeId}
        onChange={(e) => router.push(`/admin?season=${e.target.value}`)}
        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        aria-label="Saison wählen"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <CreateSeasonForm />
    </div>
  );
}
