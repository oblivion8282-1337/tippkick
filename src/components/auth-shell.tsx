import Link from 'next/link';

import { Wordmark } from '@/components/wordmark';

/**
 * Auth-Layout: geteilte Optik für Login, Registrierung, Passwort-vergessen
 * und Passwort-neu-setzen. Linke Seite: Branding + Erklärung; rechte Seite:
 * die Form. Auf mobil: nur die Form.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="from-card via-card to-pitch/8 relative hidden overflow-hidden bg-gradient-to-br p-12 lg:flex lg:flex-col lg:justify-between dark:bg-gradient-to-br dark:from-card dark:via-card dark:to-pitch/12">
        {/* Subtile Pitch-Linien als Hintergrund-Akzent. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0, transparent 48px, currentColor 48px, currentColor 49px)',
          }}
        />
        <Link href="/" className="relative z-10 inline-flex">
          <Wordmark size="lg" />
        </Link>
        <div className="relative z-10 max-w-md space-y-4">
          <p className="font-mono text-[0.7rem] font-medium tracking-[0.2em] text-pitch uppercase">
            Tippverein
          </p>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            Jedes Wochenende ein Spieltags­zettel — nur digital.
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Tippe 1. und 2. Bundesliga online, die Tippleitung lädt am Ende die fertige Auswertung als Excel.
            Schluss mit E-Mails mit Anhängen, die im Spam landen.
          </p>
        </div>
        <p className="text-muted-foreground relative z-10 text-xs">
          © {new Date().getFullYear()} Tippverein
        </p>
      </aside>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2 lg:hidden">
            <Link href="/" className="inline-flex">
              <Wordmark size="md" />
            </Link>
          </div>
          <div className="space-y-2">
            {eyebrow && (
              <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.18em] uppercase">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}