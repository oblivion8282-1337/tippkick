import 'dotenv/config';

import { ROLE_ADMIN } from '../src/lib/constants';
import { prisma } from '../src/lib/prisma';
import { createCredentialUser } from '../src/lib/tippers';

/**
 * Bootstrap-Zugang. Es gibt KEIN eigenes „Tippleitung"-Konto — die Tippleitung
 * ist einer der Tipper mit zusätzlichen Rechten. Der Seed legt deshalb genau
 * einen Tipper an, der zugleich Admin ist; die Rechte lassen sich später im
 * Admin auf jeden anderen Tipper übertragen (Rollen-Dropdown).
 */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'cordoba@tippkick.local';
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Cordoba';

/** Bootstrap-Admin-Passwort: MUSS gesetzt sein. Kein Default – sonst öffentlich bekannt. */
function requireAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 12) {
    throw new Error(
      'ADMIN_PASSWORD fehlt oder ist zu kurz (mind. 12 Zeichen). ' +
        'In .env setzen, z. B. `openssl rand -base64 18 | tr -d "\\n"`.',
    );
  }
  return pw;
}

const ADMIN_PASSWORD = requireAdminPassword();

async function main() {
  // 1) Saison + Wettbewerb Bundesliga (1.+2. Liga) als Import-Ziel. OpenLigaDB-Quelle
  //    bl1+bl2; Spieltage werden vom Cron automatisch importiert und vom Admin in
  //    Tipptage gruppiert (/admin/spieltage). 26/27 = kommende echte Saison.
  const season = await prisma.season.upsert({
    where: { name: '26/27' },
    update: {},
    create: { name: '26/27' },
  });
  await prisma.competition.upsert({
    where: { seasonId_key: { seasonId: season.id, key: 'BL' } },
    update: { sourceShortcuts: ['bl1', 'bl2'] },
    create: {
      seasonId: season.id,
      key: 'BL',
      name: 'Bundesliga (1. + 2. Liga)',
      sortOrder: 0,
      sourceShortcuts: ['bl1', 'bl2'],
    },
  });

  // 2) Bootstrap: ein Tipper mit Admin-Rechten (kein separates Tippleitungs-Konto).
  await createCredentialUser({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: ROLE_ADMIN });

  console.log(`Seed fertig. Login: ${ADMIN_NAME} <${ADMIN_EMAIL}> (Tipper + Tippleitung)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
