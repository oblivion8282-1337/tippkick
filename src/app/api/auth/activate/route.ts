import { NextResponse } from 'next/server';
import { hashPassword } from 'better-auth/crypto';

import { prisma } from '@/lib/prisma';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { resolveLoginIdentifier } from '@/lib/resolve-login';

/**
 * Erstpasswort setzen für VORBEREITETE Konten (von der Tippleitung ohne Passwort
 * angelegt). Der Member identifiziert sich per Name oder E-Mail; existiert das
 * Konto noch ohne Zugangsdaten, wird das gewählte Passwort gesetzt. Danach
 * normale Anmeldung. Die Seite hängt hinter dem Basic-Auth-Schutz.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { identifier?: string; password?: string } | null;
  const identifier = body?.identifier?.trim() ?? '';
  const password = body?.password ?? '';
  if (!identifier || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Bitte Name/E-Mail und ein Passwort mit mindestens ${MIN_PASSWORD_LENGTH} Zeichen angeben.` },
      { status: 400 },
    );
  }

  const user = await resolveLoginIdentifier(identifier);
  if (!user) {
    return NextResponse.json(
      { error: 'Kein Zugang für diese Angabe vorbereitet. Bitte wende dich an die Tippleitung.' },
      { status: 404 },
    );
  }

  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  });
  if (existingAccount) {
    return NextResponse.json(
      { error: 'Für diesen Zugang ist bereits ein Passwort gesetzt. Bitte einloggen.' },
      { status: 409 },
    );
  }

  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: user.id,
      userId: user.id,
      providerId: 'credential',
      password: await hashPassword(password),
    },
  });

  return NextResponse.json({ email: user.email, name: user.name });
}
