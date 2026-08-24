import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getManageableSeason } from '@/lib/matchdays';
import { getEmergencyConfig } from '@/lib/emergency-tip';
import { SettingsForm } from '@/components/settings-form';
import { EmergencyTipCard } from '@/components/emergency-tip-card';
import { PageHeader } from '@/components/page-header';

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireUser();
  const { tab: tabParam } = await searchParams;
  const tab: 'profil' | 'notfalltipp' = tabParam === 'notfalltipp' ? 'notfalltipp' : 'profil';

  // Team-Auswahl: alle Mannschaften der aktiven Saison (für Sonderregeln).
  const season = await getManageableSeason();
  const [emergency, teams] = await Promise.all([
    getEmergencyConfig(session.user.id),
    season
      ? prisma.fixture
          .findMany({
            where: { section: { competition: { seasonId: season.id } } },
            select: { homeTeam: true, awayTeam: true },
          })
          .then((rows) => [...new Set(rows.flatMap((r) => [r.homeTeam, r.awayTeam]))].sort((a, b) => a.localeCompare(b, 'de')))
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Konto" title="Einstellungen" description="Profil und Notfalltipp." />

      <nav className="border-border/40 flex gap-1 border-b" aria-label="Einstellungen-Bereiche">
        {(
          [
            ['profil', 'Profil'],
            ['notfalltipp', 'Notfalltipp'],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/einstellungen${key === 'notfalltipp' ? '?tab=notfalltipp' : ''}`}
            aria-current={tab === key ? 'page' : undefined}
            className={
              tab === key
                ? 'text-primary border-primary -mb-px border-b-2 px-4 py-2 text-sm font-medium'
                : 'text-muted-foreground border-transparent hover:text-foreground -mb-px border-b-2 px-4 py-2 text-sm'
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'profil' ? (
        <SettingsForm
          initialName={session.user.name ?? ''}
          initialEmail={session.user.email}
          initialImage={session.user.image ?? null}
          emailVerificationRequired={Boolean(process.env.SMTP_HOST)}
        />
      ) : (
        <EmergencyTipCard emergency={emergency} teams={teams} />
      )}
    </div>
  );
}
