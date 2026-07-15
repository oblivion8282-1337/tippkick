import { cn } from '@/lib/utils';

/**
 * Einheitlicher Header-Block am Anfang einer Seite. Display-Typografie
 * (font-display), optional Eyebrow + Description. Optionaler Action-Bereich
 * rechts (z. B. „Neuer Spieltag" auf Admin-Seiten).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('border-border/60 flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between', className)}>
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.18em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}