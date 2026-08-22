'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, KeyRound, Mail, User, UserCog } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { AvatarCropDialog } from '@/components/avatar-crop-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { cn } from '@/lib/utils';

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
    <div className="mx-auto max-w-2xl space-y-6">
      <AvatarCard initialImage={initialImage} initialName={initialName} />
      <NameCard initialName={initialName} />
      <EmailCard initialEmail={initialEmail} />
      <PasswordCard />
    </div>
  );
}

function NameCard({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === initialName) {
      setIsError(true);
      setMessage('Der Name ist schon gespeichert.');
      return;
    }
    setPending(true);
    setMessage(null);
    setIsError(false);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setPending(false);
    if (error) {
      setIsError(true);
      setMessage(error.message ?? 'Fehler.');
    } else {
      setMessage('Name gespeichert.');
      router.refresh(); // Session-Daten (z. B. Anzeige oben rechts) aktualisieren
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="text-pitch h-4 w-4" />
          Benutzername
        </CardTitle>
        <CardDescription>Wird in Tipp-Listen und Auswertungen angezeigt.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={40}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Speichert …' : 'Speichern'}
            </Button>
            {message && <p className={cn('text-sm', isError ? 'text-destructive' : 'text-pitch')}>{message}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AvatarCard({ initialImage, initialName }: { initialImage: string | null; initialName: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [image, setImage] = useState(initialImage);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // gleiche Datei nochmal wählen soll erneut öffnen
    if (file) setCropFile(file);
  }

  async function uploadCropped(blob: Blob) {
    setCropFile(null);
    setPending(true);
    setMessage(null);
    try {
      const upload = new FormData();
      upload.set('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      const response = await fetch('/api/avatar', { method: 'POST', body: upload });
      setPending(false);
      if (response.ok) {
        const data = (await response.json()) as { image: string };
        setImage(`${data.image}?${Date.now()}`); // Cache-Buster
        setMessage('Profilbild aktualisiert.');
        router.refresh(); // Kopfzeile (Avatar oben rechts) sofort aktualisieren
      } else {
        setMessage(await response.text());
      }
    } catch {
      setPending(false);
      setMessage('Bild konnte nicht hochgeladen werden.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="text-pitch h-4 w-4" />
          Profilbild
        </CardTitle>
        <CardDescription>Wird im Verein angezeigt.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={initialName} className="ring-border h-20 w-20 rounded-full object-cover ring-2" />
          ) : (
            <div className="bg-muted text-muted-foreground font-display flex h-20 w-20 items-center justify-center rounded-full text-3xl font-semibold">
              {initialName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-muted-foreground text-sm">
            <p className="text-foreground font-medium">{initialName}</p>
            <p>JPG, PNG oder WebP</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="hidden"
          />
          <Button size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {pending ? 'Lädt …' : cropFile ? 'Bild wählen …' : 'Bild auswählen'}
          </Button>
          {message && (
            <p className={cn('text-sm', message.includes('aktualisiert') ? 'text-pitch' : 'text-destructive')}>
              {message}
            </p>
          )}
        </div>
      </CardContent>
      {cropFile && (
        <AvatarCropDialog file={cropFile} onCancel={() => setCropFile(null)} onConfirm={uploadCropped} />
      )}
    </Card>
  );
}

function EmailCard({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setIsError(false);
    const { error } = await authClient.changeEmail({ newEmail: email });
    setPending(false);
    if (error) {
      setIsError(true);
      setMessage(error.message ?? 'Fehler.');
    } else {
      setMessage('Bestätigungs-Mail an die neue Adresse geschickt.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="text-pitch h-4 w-4" />
          E-Mail-Adresse
        </CardTitle>
        <CardDescription>Änderung muss per Mail bestätigt werden.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email">Neue E-Mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Speichert …' : 'E-Mail ändern'}
            </Button>
            {message && <p className={cn('text-sm', isError ? 'text-destructive' : 'text-pitch')}>{message}</p>}
          </div>
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
  const [isError, setIsError] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword === currentPassword) {
      setIsError(true);
      setMessage('Neues Passwort muss sich vom aktuellen unterscheiden.');
      return;
    }
    setPending(true);
    setMessage(null);
    setIsError(false);
    const { error } = await authClient.changePassword({ currentPassword, newPassword });
    setPending(false);
    if (error) {
      setIsError(true);
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
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="text-pitch h-4 w-4" />
          Passwort
        </CardTitle>
        <CardDescription>Mindestens {MIN_PASSWORD_LENGTH} Zeichen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Speichert …' : 'Passwort ändern'}
            </Button>
            {message && <p className={cn('text-sm', isError ? 'text-destructive' : 'text-pitch')}>{message}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
