import { cn } from '@/lib/utils';

/** Vereins-Wordmark (nur Schriftzug). */
export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <span className={cn('font-display leading-none font-semibold tracking-tight', textSize, className)}>
      V.O.T.Z.E.
    </span>
  );
}
