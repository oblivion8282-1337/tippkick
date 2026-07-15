import Link from 'next/link';
import { type ComponentProps } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Button-Styling, aber als Link (<a>). Ein zentraler Ort für dieses Muster:
 * Base UI erwartet sonst ein natives <button> (nativeButton=true). Für Links
 * muss nativeButton deaktiviert werden – hier gebündelt, nicht pro Aufruf.
 */
type LinkButtonProps = ComponentProps<typeof Button> & { href: ComponentProps<typeof Link>['href'] };

export function LinkButton({ href, children, ...props }: LinkButtonProps) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} {...props}>
      {children}
    </Button>
  );
}
