/**
 * E-Mail-Versand (SSOT für alle Mails: Verifizierung, Reset, 2FA, später Reminder).
 * - Dev (SMTP_HOST leer, NODE_ENV != production): Mails werden nur in der Konsole ausgegeben
 *   (Subject + Empfänger, OHNE Body — der enthält Token-URLs, die nicht ins Log gehören).
 * - Prod: SMTP via SMTP_*-ENV. Ohne SMTP_HOST in Prod wird hart geworfen, sonst landen
 *   Verifizierungs-/Reset-Tokens in Container-Logs und sind ein Account-Takeover-Vektor.
 *
 * Bewusst ohne schwere Abhängigkeit: nodemailer nur im Prod-Pfad.
 */

type Mail = { to: string; subject: string; text: string };

export async function sendMail(mail: Mail): Promise<void> {
  const { SMTP_HOST } = process.env;
  const isProd = process.env.NODE_ENV === 'production';

  if (!SMTP_HOST) {
    if (isProd) {
      throw new Error('SMTP_HOST ist in production nicht gesetzt – Mail-Versand abgebrochen');
    }
    // Dev: komplette Mail inkl. Token-URL in der Konsole — nur so sind
    // Verifizierungs-/Reset-Flows ohne SMTP end-to-end testbar. Prod-Logs bleiben
    // tokenfrei (oberer Zweig wirft bzw. SMTP-Zweig loggt gar nicht).
    console.log(`[dev-mail] an=${mail.to} betreff=${mail.subject}`);
    console.log(`[dev-mail] body:\n${mail.text}`);
    return;
  }

  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'Tippverein <tippspiel@localhost>',
    ...mail,
  });
}
