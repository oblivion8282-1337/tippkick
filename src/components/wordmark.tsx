import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Vereins-Wordmark: Logo (public/vote-logo.png) + Kuerzel V.O.T.Z.E.
 * Logo ist helle Grafik auf transparent — funktioniert auf dunklem Grund
 * (Default-Theme).
 */
export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  // lg = Login-Branding: fuellt die verfuegbare Breite (Logo links, Schrift rechts).
  const isLarge = size === 'lg';
  const logoH = size === 'sm' ? 'h-6' : isLarge ? 'h-28 sm:h-48' : 'h-8';
  const textSize = size === 'sm' ? 'text-sm' : isLarge ? 'text-5xl sm:text-7xl' : 'text-base';
  return (
    <span className={cn('flex items-center', isLarge ? 'gap-3 sm:gap-4' : 'gap-2.5', className)}>
      <Image
        src="/vote-logo.png"
        alt="V.O.T.Z.E. Logo"
        width={335}
        height={445}
        className={cn(logoH, 'w-auto')}
        priority
      />
      <span className={cn('font-display leading-none font-semibold tracking-tight', textSize)}>V.O.T.Z.E.</span>
    </span>
  );
}
