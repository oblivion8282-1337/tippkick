import { cn } from '@/lib/utils';

/**
 * Vereins-Wordmark mit Pitch-Green-Akzent. Wir zeichnen ein kleines Icon selbst
 * (kein externer Asset), damit es ohne Bilder auskommt und im Theme bleibt:
 * zwei ineinandergreifende Pfeile — grob an einen Fußball-Effekt erinnernd,
 * aber abstrakt genug, um nicht zu cartoonhaft zu wirken.
 */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 28 : 22;

  return (
    <span className={cn('inline-flex items-center gap-2 font-display font-semibold tracking-tight', textSize, className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="text-pitch"
      >
        {/* Äußerer Ring + Innenkreis + Akzent — wie ein Stadion von oben. */}
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 4.5 V8 M12 16 V19.5 M4.5 12 H8 M16 12 H19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>V.O.T.Z.E.</span>
    </span>
  );
}