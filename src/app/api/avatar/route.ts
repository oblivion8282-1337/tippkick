import { writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Magic-Bytes je erlaubtem Format. Client-MIME ist nicht vertrauenswürdig (lässt sich fälschen). */
const MAGIC_BY_EXT: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46], // "RIFF"; vollständige WebP-Validierung: bytes 8..11 = "WEBP"
};
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Profilbild-Upload: speichert unter public/avatars/<userId>.<ext> und setzt user.image. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response('Nicht eingeloggt', { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return new Response('Keine Datei', { status: 400 });
  }
  const ext = file.type.split('/')[1];
  const magic = MAGIC_BY_EXT[ext];
  if (!magic) {
    return new Response('Nur JPEG/PNG/WebP erlaubt', { status: 400 });
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    return new Response('Datei zu groß (max 2 MB)', { status: 400 });
  }
  // Magic-Bytes prüfen statt nur der MIME-Angabe zu vertrauen.
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) {
      return new Response('Dateityp passt nicht zum Inhalt', { status: 400 });
    }
  }

  const filename = `${session.user.id}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'avatars');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  // Vorheriges Bild (anderer Extension) loeschen, sonst wachst /public/avatars
  // mit jedem Format-Wechsel um eine verwaiste Datei. Sanitisieren: nur Dateinamen
  // aus dem /avatars/-Namespace, kein Pfad-Traversal.
  const previous = session.user.image;
  if (previous && previous.startsWith('/avatars/') && previous !== `/avatars/${filename}`) {
    const previousName = previous.slice('/avatars/'.length);
    // Nur loeschen, wenn es ein reiner Dateiname OHNE Pfad-Separatoren ist
    // und nur erlaubte Zeichen enthaelt.
    if (
      previousName !== filename &&
      !previousName.includes('/') &&
      !previousName.includes('\\') &&
      !previousName.includes('..') &&
      /^[A-Za-z0-9._-]+$/.test(previousName)
    ) {
      await unlink(path.join(dir, previousName)).catch(() => {
        // bewusst still – wenn die Datei schon weg ist, ist das ok.
      });
    }
  }

  const url = `/avatars/${filename}`;
  await prisma.user.update({ where: { id: session.user.id }, data: { image: url } });

  return Response.json({ image: url });
}
