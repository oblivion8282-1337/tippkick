import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { syncOpenLigaDb } from '@/lib/openligadb-sync';

/**
 * Cron-Einstieg für den OpenLigaDB-Abgleich (Spieltage importieren + Ergebnisse
 * aktualisieren). Geschützt via Bearer-Token (CRON_SECRET); aufgerufen vom
 * Cron-Sidecar im Produktiv-Compose (aller ~15 Min). In Dev per `pnpm sync:results`.
 *
 * Nur POST: GETs wären cache-fähig + per Browser/Link prefetchbar und sollten
 * keine Mutationen auslösen.
 */
export const dynamic = 'force-dynamic';

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Ohne konfiguriertes Secret den Endpoint hart sperren (kein offener Sync).
    return new NextResponse('CRON_SECRET not configured', { status: 503 });
  }
  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // Constant-time-Vergleich: a/b müssen gleich lang sein, sonst wirft timingSafeEqual.
  // Mit Dummy-Compare gleicher Länge verhindern wir den Length-Oracle.
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  const matches = a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  if (!matches) {
    return unauthorized();
  }

  const summary = await syncOpenLigaDb();
  return NextResponse.json(summary, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
