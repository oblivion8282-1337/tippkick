import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import { twoFactor } from 'better-auth/plugins';

import { prisma } from './prisma';
import { sendMail } from './email';

/**
 * better-auth-Zentrale Konfiguration (SSOT für Auth).
 * - E-Mail/Passwort mit Verifizierung & Passwort-Reset
 * - optionale 2FA (TOTP) via twoFactor-Plugin
 * - Rollen (user/admin) via admin-Plugin
 * - Prisma-Adapter: Auth-Tabellen leben in derselben Postgres-DB
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  secret: process.env.AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // erst nach Klick auf den Verifizierungs-Link einloggen
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Tippverein – E-Mail bestätigen',
        text: `Bitte bestätige deine E-Mail-Adresse:\n${url}`,
      });
    },
  },
  passwordReset: {
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendMail({
        to: user.email,
        subject: 'Tippverein – Passwort zurücksetzen',
        text: `Du kannst dein Passwort zurücksetzen unter:\n${url}`,
      });
    },
  },
  plugins: [
    twoFactor(),
    admin({
      defaultRole: 'user',
      adminRole: 'admin',
    }),
  ],
  user: {
    additionalFields: {
      // Neu-Registrierungen sind erst nach Freischaltung durch die Tippleitung tippbar.
      approved: { type: 'boolean', defaultValue: false, input: false },
    },
  },
});
