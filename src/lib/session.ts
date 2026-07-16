import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { ROLE_ADMIN } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

/** better-auth-inferenzierter Session-Typ (enthält plugin-Felder wie `role`). */
type SessionData = typeof auth.$Infer.Session;

/**
 * Session-Zugriff für Server Components & Server Actions (SSOT für Auth-Checks).
 * Sicherheit wird hier (server-seitig) erzwungen, nie nur im UI.
 */
export async function getSession(): Promise<SessionData | null> {
  return await auth.api.getSession({ headers: await headers() });
}

/** Liest approved/banned/banExpires frisch aus der DB (better-auth cached die Session). */
export async function getUserGate(userId: string): Promise<{ approved: boolean; banned: boolean } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { approved: true, banned: true, banExpires: true },
  });
  if (!u) {
    return null;
  }
  // Auto-unban, wenn banExpires abgelaufen ist.
  const banActive = Boolean(u.banned) && (!u.banExpires || u.banExpires.getTime() > Date.now());
  return { approved: u.approved, banned: banActive };
}

/** Wirft den Nutzer zum Login, falls nicht eingeloggt oder gebannt. */
export async function requireUser(): Promise<SessionData> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  const gate = await getUserGate(session.user.id);
  if (!gate?.approved || gate.banned) {
    redirect('/login?reason=banned');
  }
  return session;
}

/** Wirft Nicht-Admins weg (auf /not-found → kein Information Leak). */
export async function requireAdmin(): Promise<SessionData> {
  const session = await requireUser();
  if (session.user.role !== ROLE_ADMIN) {
    redirect('/not-found');
  }
  return session;
}
