'use client';

import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';

export function SettingsForm({
  initialName,
  initialEmail,
  initialImage,
}: {
  initialName: string;
  initialEmail: string;
  initialImage: string | null;
}) {
  return (
    <div className="space-y-6">
      <AvatarCard initialImage={initialImage} initialName={initialName} />
      <EmailCard initialEmail={initialEmail} />
      <PasswordCard />
    </div>
  );
}

function AvatarCard({ initialImage, initialName }: { initialImage: string | null; initialName: string }) {
  const [image, setImage] = useState(initialImage);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return;
    }
    setPending(true);
    setMessage(null);
    const response = await fetch('/api/avatar', { method: 'POST', body: formData });
    setPending(false);
    if (response.ok) {
      const data = (await response.json()) as { image: string };
      setImage(`${data.image}?${Date.now()}`); // Cache-Buster
      setMessage('Profilbild aktualisiert.');
    } else {
      setMessage(await response.text());
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profilbild</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={initialName} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold">
            {initialName.charAt(0).toUpperCase()}
          </div>
        )}
        <form onSubmit={onUpload} className="flex flex-col gap-2">
          <Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Lädt …' : 'Hochladen'}
          </Button>
          {message && <span className="text-muted-foreground text-sm">{message}</span>}
        </form>
      </CardContent>
    </Card>
  );
}

function EmailCard({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const { error } = await authClient.changeEmail({ newEmail: email });
    setPending(false);
    setMessage(error ? (error.message ?? 'Fehler.') : 'Bestätigungs-Mail an die neue Adresse geschickt.');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-Mail-Adresse</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Neue E-Mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="w-fit">
            {pending ? 'Speichert …' : 'E-Mail ändern'}
          </Button>
          {message && <span className="text-muted-foreground text-sm">{message}</span>}
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const { error } = await authClient.changePassword({ currentPassword, newPassword });
    setPending(false);
    if (error) {
      setMessage(error.message ?? 'Fehler.');
    } else {
      setMessage('Passwort geändert.');
      setCurrentPassword('');
      setNewPassword('');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">Neues Passwort</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="w-fit">
            {pending ? 'Speichert …' : 'Passwort ändern'}
          </Button>
          {message && <span className="text-muted-foreground text-sm">{message}</span>}
        </form>
      </CardContent>
    </Card>
  );
}
