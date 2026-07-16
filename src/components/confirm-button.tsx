'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';

/**
 * Submit-Button, der vor dem Absenden einen Bestätigungsdialog anzeigt.
 * Für destruktive Formular-Aktionen (Löschen/Ablehnen).
 *
 * Doppelklick-Schutz: nach Bestätigung wird der Button sofort deaktiviert,
 * damit ein schneller zweiter Klick nicht erneut confirm() auslöst.
 */
export function ConfirmButton({ confirm, ...props }: React.ComponentProps<typeof Button> & { confirm: string }) {
  const [confirmed, setConfirmed] = React.useState(false);

  return (
    <Button
      {...props}
      type="submit"
      disabled={props.disabled || confirmed}
      onClick={(event) => {
        if (confirmed) {
          return;
        }
        if (!window.confirm(confirm)) {
          event.preventDefault();
          return;
        }
        // Bestätigt: Button sofort sperren, damit Doppelklick nicht
        // die Aktion zweimal auslöst.
        setConfirmed(true);
      }}
    />
  );
}
