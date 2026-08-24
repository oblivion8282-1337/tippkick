import { NextResponse } from 'next/server';

import { resolveLoginIdentifier } from '@/lib/resolve-login';

/**
 * Tipper-Name → E-Mail für den Login (better-auth meldet sich mit E-Mail an).
 * Liefert nur die E-Mail eines existierenden Kontos — hinter dem Basic-Auth-Schutz.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { identifier?: string } | null;
  const identifier = body?.identifier?.trim() ?? '';
  if (!identifier) {
    return NextResponse.json({ error: 'Angabe fehlt' }, { status: 400 });
  }
  const user = await resolveLoginIdentifier(identifier);
  if (!user) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ email: user.email });
}
