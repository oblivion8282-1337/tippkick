'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

/**
 * Submit-Button, der vor dem Absenden einen Bestätigungsdialog anzeigt.
 * Für destruktive Formular-Aktionen (Löschen/Ablehnen).
 *
 * Doppelklick-Schutz über useFormStatus: der Button ist gesperrt, SOLANGE die
 * Server Action läuft. Bewusst nicht per State im onClick — ein dort gesetztes
 * `disabled` greift noch vor der Standardaktion des Klicks (React flusht
 * Klick-Events synchron), und ein deaktivierter Button sendet sein Formular
 * nicht ab. Der Schutz hätte dann den ERSTEN Klick verhindert statt des zweiten.
 *
 * Muss innerhalb des <form> stehen — useFormStatus liest den Status des
 * umgebenden Formulars.
 */
export function ConfirmButton({ confirm, ...props }: React.ComponentProps<typeof Button> & { confirm: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      type="submit"
      disabled={props.disabled || pending}
      onClick={(event) => {
        if (!window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    />
  );
}
