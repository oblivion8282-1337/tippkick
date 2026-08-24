import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

/**
 * E-Mail-Adresse DIREKT aendern (ohne Bestaetigungsmail) — nur solange kein
 * SMTP konfiguriert ist. Sobald SMTP_HOST steht, nutzt das Frontend wieder den
 * better-auth-Flow (changeEmail mit Verifizierung). Session-pflichtig.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { newEmail?: string } | null;
  const newEmail = body?.newEmail?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: 'Das ist keine gültige E-Mail-Adresse.' }, { status: 400 });
  }
  if (newEmail === session.user.email) {
    return NextResponse.json({ error: 'Diese Adresse ist bereits gespeichert.' }, { status: 400 });
  }
  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken) {
    return NextResponse.json({ error: 'Diese Adresse ist bereits vergeben.' }, { status: 409 });
  }
  await prisma.user.update({ where: { id: session.user.id }, data: { email: newEmail } });
  return NextResponse.json({ email: newEmail });
}
