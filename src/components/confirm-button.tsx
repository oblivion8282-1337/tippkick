'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';

/**
 * Submit-Button, der vor dem Absenden einen Bestätigungsdialog anzeigt.
 * Für destruktive Formular-Aktionen (Löschen/Ablehnen).
 */
export function ConfirmButton({ confirm, ...props }: React.ComponentProps<typeof Button> & { confirm: string }) {
  return (
    <Button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    />
  );
}
