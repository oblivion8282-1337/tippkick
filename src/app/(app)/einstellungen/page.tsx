import { requireUser } from '@/lib/session';
import { SettingsForm } from '@/components/settings-form';
import { PageHeader } from '@/components/page-header';

export default async function EinstellungenPage() {
  const session = await requireUser();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Konto" title="Einstellungen" description="Profilbild, E-Mail-Adresse und Passwort." />
      <SettingsForm
        initialName={session.user.name ?? ''}
        initialEmail={session.user.email}
        initialImage={session.user.image ?? null}
      />
    </div>
  );
}
