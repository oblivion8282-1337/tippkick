import { Suspense } from 'react';

import { AuthShell } from '@/components/auth-shell';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Neues Passwort" title="Passwort setzen" subtitle="Wähle ein sicheres Passwort.">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Lädt …</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}