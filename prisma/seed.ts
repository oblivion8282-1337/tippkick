import 'dotenv/config';
import { hashPassword } from 'better-auth/crypto';

import { ROLE_ADMIN, ROLE_USER, type Role } from '../src/lib/constants';
import { prisma } from '../src/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tippkick.local';

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

async function createUser(opts: { name: string; email: string; password: string; role: Role }) {
  const { name, email, password, role } = opts;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }

  const hashed = await hashPassword(password);
  const userId = crypto.randomUUID();
  return prisma.user.create({
    data: {
      id: userId,
      name,
      email,
      emailVerified: true, // Seed-Nutzer direkt verifiziert
      approved: true, // Seed-Nutzer direkt freigeschaltet
      role,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: 'credential',
          password: hashed,
        },
      },
    },
  });
}

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

  // 2) Bootstrap-Admin + Demo-Tipper
  await createUser({ name: 'Tippleitung', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: ROLE_ADMIN });
  await createUser({ name: 'Cordoba', email: 'cordoba@tippkick.local', password: 'demo1234', role: ROLE_USER });

  console.log('Seed fertig. Admin-Login:', ADMIN_EMAIL);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
