import { requireUser } from '@/lib/session';
import { SettingsForm } from '@/components/settings-form';

export default async function EinstellungenPage() {
  const session = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <SettingsForm
        initialName={session.user.name ?? ''}
        initialEmail={session.user.email}
        initialImage={session.user.image ?? null}
      />
    </div>
  );
}
