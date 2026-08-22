'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setUserRoleAction } from '@/app/(admin)/admin/actions';
import { ROLE_ADMIN, ROLE_USER } from '@/lib/constants';

/**
 * Rollen-Dropdown pro Tipper (Tipper / Tippleitung). Wechselt beim Ändern sofort
 * per Server-Action. Die eigene Zeile wird ohne dieses Dropdown gerendert (Self-
 * Protection), daher gibt es hier keinen Selbst-Schutz.
 */
export function RoleSelectForm({ userId, role }: { userId: string; role: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onChange(value: string) {
    const fd = new FormData();
    fd.set('userId', userId);
    fd.set('role', value);
    // Bei Fehler (Validierung/Letzter-Admin-Guard) springt das unkontrollierte
    // Select nicht zurück — daher resyncen: nach der Action den Server-Stand holen.
    start(async () => {
      try {
        await setUserRoleAction(fd);
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <select
      key={role}
      defaultValue={role}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="border-input bg-background h-8 rounded-md border px-2 text-sm disabled:opacity-50"
      aria-label="Rolle"
    >
      <option value={ROLE_USER}>Tipper</option>
      <option value={ROLE_ADMIN}>Tippleitung</option>
    </select>
  );
}
