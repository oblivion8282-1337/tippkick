'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';

import { createSeasonAction } from '@/app/(admin)/admin/actions';
import { MAX_TEXT_LENGTH } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Legt eine neue Saison an. Zuerst nur ein „Neue Saison"-Button; beim Klicken klappt
 * das Eingabefeld auf ( jährliche Aktion → bewusst hinter einem Klick versteckt).
 */
export function CreateSeasonForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Neue Saison
      </Button>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    start(async () => {
      try {
        await createSeasonAction(formData);
      } catch (submitError) {
        // createSeasonAction kann bei zu langem Namen werfen (requireTextField).
        // Server-Action-Throw wird zu plain 500 ohne sichtbares UI → hier abfangen.
        const message = submitError instanceof Error ? submitError.message : 'Anlegen fehlgeschlagen';
        setError(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="season-name" className="sr-only">
            Neue Saison
          </Label>
          <Input
            id="season-name"
            name="name"
            placeholder="z. B. 27/28"
            className="h-8 w-28"
            required
            maxLength={MAX_TEXT_LENGTH}
            autoFocus
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Anlege …' : 'Anlegen'}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          aria-label="Abbrechen"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
