'use client';

import { useTransition } from 'react';

import { assignRoundAction } from '@/app/(admin)/admin/actions';

type Tipptag = { id: string; number: number };

/**
 * Dropdown, um einen Spieltag einem Tipptag zuzuordnen (oder abzuhängen).
 * Wechselt beim Ändern sofort per Server-Action ('' = keinem Tipptag zugeordnet).
 */
export function AssignRoundForm({
  sectionId,
  tipptage,
  current,
}: {
  sectionId: string;
  tipptage: Tipptag[];
  current: string | null;
}) {
  const [pending, start] = useTransition();

  function onChange(value: string) {
    const fd = new FormData();
    fd.set('sectionId', sectionId);
    fd.set('matchdayId', value);
    start(() => assignRoundAction(fd));
  }

  return (
    <select
      defaultValue={current ?? ''}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="border-input bg-background h-8 rounded-md border px-2 text-sm disabled:opacity-50"
      aria-label="Tipptag zuweisen"
    >
      <option value="">— keiner —</option>
      {tipptage.map((t) => (
        <option key={t.id} value={t.id}>
          {t.number}. Tipptag
        </option>
      ))}
    </select>
  );
}
