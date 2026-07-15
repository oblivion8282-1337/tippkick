/**
 * E-Mail-Versand (SSOT für alle Mails: Verifizierung, Reset, 2FA, später Reminder).
 * - Dev (SMTP_HOST leer): Mails werden nur in der Konsole ausgegeben.
 * - Prod: SMTP via SMTP_*-ENV.
 *
 * Bewusst ohne schwere Abhängigkeit: nodemailer nur im Prod-Pfad.
 */

type Mail = { to: string; subject: string; text: string };

export async function sendMail(mail: Mail): Promise<void> {
  const { SMTP_HOST } = process.env;

  if (!SMTP_HOST) {
    console.log('[dev-mail] kein SMTP konfiguriert -> Mail wird nur geloggt:\n', mail);
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
