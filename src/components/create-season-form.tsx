'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { createSeasonAction } from '@/app/(admin)/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Legt eine neue Saison an. Zuerst nur ein „Neue Saison"-Button; beim Klicken klappt
 * das Eingabefeld auf ( jährliche Aktion → bewusst hinter einem Klick versteckt).
 */
export function CreateSeasonForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Neue Saison
      </Button>
    );
  }

  return (
    <form action={createSeasonAction} className="flex items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="season-name" className="sr-only">
          Neue Saison
        </Label>
        <Input id="season-name" name="name" placeholder="z. B. 27/28" className="h-8 w-28" required autoFocus />
      </div>
      <Button type="submit" size="sm">
        Anlegen
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Abbrechen">
        <X className="h-4 w-4" />
      </Button>
    </form>
  );
}
