import { Suspense } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Neues Passwort</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-muted-foreground text-sm">Lädt …</p>}>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
