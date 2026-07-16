'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

/**
 * Submit-Button mit automatischem Pending-State aus useFormStatus.
 * Use in <form action={someServerAction}> um Doppelklicks zu verhindern.
 */
export function SubmitButton({
  pendingText,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={props.disabled || pending}>
      {pending && pendingText ? pendingText : props.children}
    </Button>
  );
}
