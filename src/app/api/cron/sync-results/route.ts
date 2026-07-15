import { NextResponse } from 'next/server';

import { syncOpenLigaDb } from '@/lib/openligadb-sync';

/**
 * Cron-Einstieg für den OpenLigaDB-Abgleich (Spieltage importieren + Ergebnisse
 * aktualisieren). Geschützt via Bearer-Token (CRON_SECRET); aufgerufen vom
 * Cron-Sidecar im Produktiv-Compose (aller ~15 Min). In Dev per `pnpm sync:results`.
 */
export const dynamic = 'force-dynamic';

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  return runSync(request);
}

export async function POST(request: Request): Promise<Response> {
  return runSync(request);
}

async function runSync(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Ohne konfiguriertes Secret den Endpoint hart sperren (kein offener Sync).
    return new NextResponse('CRON_SECRET not configured', { status: 503 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const summary = await syncOpenLigaDb();
  return NextResponse.json(summary);
}
