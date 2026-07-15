import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

/** better-auth-inferenzierter Session-Typ (enthält plugin-Felder wie `role`). */
type SessionData = typeof auth.$Infer.Session;

/**
 * Session-Zugriff für Server Components & Server Actions (SSOT für Auth-Checks).
 * Sicherheit wird hier (server-seitig) erzwungen, nie nur im UI.
 */
export async function getSession(): Promise<SessionData | null> {
  return await auth.api.getSession({ headers: await headers() });
}

/** Wirft den Nutzer zum Login, falls nicht eingeloggt. */
export async function requireUser(): Promise<SessionData> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

/** Wirft Nicht-Admins weg (auf /not-found → kein Information Leak). */
export async function requireAdmin(): Promise<SessionData> {
  const session = await requireUser();
  if (session.user.role !== 'admin') {
    redirect('/not-found');
  }
  return session;
}
