'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Live-Update für dynamische Server-Seiten: ruft periodisch
 * router.refresh() auf, wodurch Next die Server Component neu rendert,
 * ohne einen vollen Seitenreload (Scroll-Position & Zustand bleiben).
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
