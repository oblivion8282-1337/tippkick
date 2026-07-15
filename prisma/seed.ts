import 'dotenv/config';
import { hashPassword } from 'better-auth/crypto';

import { prisma } from '../src/lib/prisma';
import { upsertSection } from '../src/lib/admin';

// ─── Spieltag 34, Saison 25/26 — Paarungen aus Vorlagen/34.TT.xlsx ───────────
// Datum/Anstoß sind DEMO-Werte (relativ zur aktuellen Saisonphase), damit die
// Spieltage zum Ausprobieren tippbar sind. Team-Paarungen entsprechen der Vorlage.
const BL_FIXTURES: [string, string][] = [
  ['Werder Bremen', 'Borussia Dortmund'],
  ['Bayern München', '1. FC Köln'],
  ['Bor. Mönchengladbach', 'TSG Hoffenheim'],
  ['Eintracht Frankfurt', 'VfB Stuttgart'],
  ['Bayer Leverkusen', 'Hamburger SV'],
  ['SC Freiburg', 'RB Leipzig'],
  ['FC St. Pauli', 'VfL Wolfsburg'],
  ['1. FC Union Berlin', 'FC Augsburg'],
  ['1. FC Heidenheim', '1. FSV Mainz 05'],
];

const L2_FIXTURES: [string, string][] = [
  ['FC Schalke 04', 'Eintr. Braunschweig'],
  ['Karlsruher SC', 'VfL Bochum'],
  ['Hannover 96', '1. FC Nürnberg'],
  ['Arminia Bielefeld', 'Hertha BSC'],
  ['Dynamo Dresden', 'Holstein Kiel'],
  ['SV Darmstadt 98', 'SC Paderborn 07'],
  ['SpVgg Greuther Fürth', 'Fortuna Düsseldorf'],
  ['1. FC Magdeburg', '1. FC Kaiserslautern'],
  ['SV Elversberg', 'Preußen Münster'],
];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tippkick.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'changeme';

async function createUser(opts: { name: string; email: string; password: string; role: 'admin' | 'user' }) {
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
  // 1) Saison
  const season = await prisma.season.upsert({
    where: { name: '25/26' },
    update: {},
    create: { name: '25/26' },
  });

  // 2) Wettbewerb Bundesliga (1.+2. Liga zusammen). sourceShortcuts = [] → kein
  // OpenLigaDB-Import; Tipptage werden aus den Vorlagen-XLSX angelegt (siehe
  // scripts/import-bundesliga-templates.ts) oder manuell im Admin.
  const competition = await prisma.competition.upsert({
    where: { seasonId_key: { seasonId: season.id, key: 'BL' } },
    update: { sourceShortcuts: [] },
    create: {
      seasonId: season.id,
      key: 'BL',
      name: 'Bundesliga (1. + 2. Liga)',
      sortOrder: 0,
      sourceShortcuts: [],
    },
  });

  // 3) Demo-Tipptag 34 (9 BL + 9 L2 in zwei Sektionen).
  // Bewusst in der VERGANGENHEIT — Demo zum Anschauen, nicht zum Tippen. So
  // wählt getCurrentSeason() automatisch die 26/27-Saison mit dem nächsten
  // echten Spieltag.
  const now = new Date();
  const saturday = new Date(now);
  saturday.setDate(saturday.getDate() - 7); // letzter Samstag
  saturday.setHours(15, 30, 0, 0);
  const friday = new Date(saturday);
  friday.setDate(friday.getDate() - 1);
  friday.setHours(19, 0, 0, 0); // Fr 19:00 = Deadline
  const sunday = new Date(saturday);
  sunday.setDate(sunday.getDate() + 1);

  // upsert mit update-Block: bestehenden Demo-Matchday auf Vergangenheit setzen,
  // damit Dashboard/Saison-Logik den richtigen „aktuellen" TT wählen.
  const matchday = await prisma.matchday.upsert({
    where: { competitionId_number: { competitionId: competition.id, number: 34 } },
    update: {
      startDate: saturday,
      endDate: sunday,
      deadlineAt: friday,
      isActive: false,
    },
    create: {
      competitionId: competition.id,
      number: 34,
      startDate: saturday,
      endDate: sunday,
      deadlineAt: friday,
      isActive: false,
    },
  });

  // Sektionen + Fixtures idempotent.
  for (const [league, fixtures] of [
    ['BL', BL_FIXTURES],
    ['L2', L2_FIXTURES],
  ] as const) {
    const section = await upsertSection({ matchdayId: matchday.id, league, number: 34 });
    const existing = await prisma.fixture.count({ where: { sectionId: section.id } });
    if (existing === 0) {
      await prisma.fixture.createMany({
        data: fixtures.map(([homeTeam, awayTeam], sortOrder) => ({
          sectionId: section.id,
          league,
          kickoff: saturday,
          homeTeam,
          awayTeam,
          sortOrder,
        })),
      });
    }
  }

  // 4) Bootstrap-Admin + Demo-Tipper
  await createUser({ name: 'Tippleitung', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
  await createUser({ name: 'Cordoba', email: 'cordoba@tippkick.local', password: 'demo1234', role: 'user' });

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