import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { AVATAR_DIR, avatarFilenameSchema } from '@/lib/avatars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Next.js bedient public/ nur mit dem Stand vom Server-Start — zur Laufzeit
// hochgeladene Avatare erreichen den Browser daher nie (404 im Prod-Build).
// Diese Route liest die Datei pro Request von der Platte.
const CONTENT_TYPES: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!avatarFilenameSchema.test(file)) {
    return new Response('Not found', { status: 404 });
  }
  const ext = file.split('.').at(-1) ?? '';
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const data = await readFile(path.join(AVATAR_DIR, file));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
