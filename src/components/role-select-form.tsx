'use client';

import { useTransition } from 'react';

import { setUserRoleAction } from '@/app/(admin)/admin/actions';
import { ROLE_ADMIN, ROLE_USER } from '@/lib/constants';

/**
 * Rollen-Dropdown pro Tipper (Tipper / Tippleitung). Wechselt beim Ändern sofort
 * per Server-Action. Die eigene Zeile wird ohne dieses Dropdown gerendert (Self-
 * Protection), daher gibt es hier keinen Selbst-Schutz.
 */
export function RoleSelectForm({ userId, role }: { userId: string; role: string }) {
  const [pending, start] = useTransition();

  function onChange(value: string) {
    const fd = new FormData();
    fd.set('userId', userId);
    fd.set('role', value);
    start(() => setUserRoleAction(fd));
  }

  return (
    <select
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
