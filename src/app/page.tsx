import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session';

/**
 * Startseite = direkter Weg ins Portal. Die alte Marketing-Landing ist fuer den
 * geschlossenen Verein ueberfluessig: eingeloggt → Dashboard, sonst → Login
 * (von dort gelangt man zu „Zugang aktivieren“).
 */
export default async function Home() {
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
