import { cn } from '@/lib/utils';

/**
 * Kleiner runder Nutzer-Avatar: Profilbild, sonst Initialbuchstabe.
 * Ein Ort, damit Avatare überall gleich aussehen.
 */
export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={name} className={cn('rounded-full object-cover', className)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-muted text-muted-foreground flex items-center justify-center rounded-full font-semibold',
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
