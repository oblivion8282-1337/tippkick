import { createAuthClient } from 'better-auth/react';
import { adminClient, twoFactorClient } from 'better-auth/client/plugins';

/**
 * better-auth-Client für Browser-Seiten (Client Components).
 * Plugins müssen zum Server-Setup passen (twoFactor, admin).
 *
 * signIn/signUp/resetPassword sind typisiert. Für die "Anforderungs"-Aufrufe
 * (Verifizierungs-Mail, Reset-Link) nutzen wir den typisierten $fetch, da die
 * generierten Methodennamen je nach Version schwanken.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient(), adminClient()],
});

/** Verifizierungs-Mail auslösen (POST /send-verification-email). */
export async function requestVerificationEmail(email: string): Promise<void> {
  await authClient.$fetch('/send-verification-email', {
    method: 'POST',
    body: { email },
  });
}

/** Link zum Zurücksetzen des Passworts anfordern (POST /forget-password). */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  await authClient.$fetch('/forget-password', {
    method: 'POST',
    body: { email, redirectTo },
  });
}
