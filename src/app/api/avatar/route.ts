import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
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
  if (!ALLOWED.has(file.type)) {
    return new Response('Nur JPEG/PNG/WebP erlaubt', { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return new Response('Datei zu groß (max 2 MB)', { status: 400 });
  }

  const ext = file.type.split('/')[1];
  const filename = `${session.user.id}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'avatars');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const url = `/avatars/${filename}`;
  await prisma.user.update({ where: { id: session.user.id }, data: { image: url } });

  return Response.json({ image: url });
}
