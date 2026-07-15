# Tippkick-Portal

Web-Plattform für einen Fußball-Tippverein. Ersetzt die Excel-per-Mail-Tippabwicklung:
Tipper tippen online, die Tippleitung lädt eine fertige Auswertungs-Excel herunter.

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma 7 · PostgreSQL · Tailwind +
shadcn/ui · better-auth · ExcelJS. Siehe auch die Projekt-`CLAUDE.md` im übergeordneten
Verzeichnis für Coding-Standards (SSOT, max. 120 Zeichen, Verify+Simplify pro Schritt).

## Lokal starten

Voraussetzungen: Node 20+, pnpm, Docker.

```bash
# 1) Postgres starten (Docker-Daemon muss laufen)
docker compose up -d db

# 2) Abhängigkeiten
pnpm install

# 3) .env anlegen (aus Vorlage) und AUTH_SECRET setzen
cp .env.example .env
sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env

# 4) Datenbank migrieren + Datenmodell erzeugen + Seed
pnpm db:migrate        # wendet Migrationen an + generiert Prisma-Client
pnpm db:seed           # Spieltag 34 (18 Partien) + Admin + Demo-Tipper 'Cordoba'

# 5) Dev-Server
pnpm dev               # http://localhost:3000
```

## Logins (nach Seed)

| Rolle               | E-Mail                   | Passwort                                                |
| ------------------- | ------------------------ | ------------------------------------------------------- |
| Tippleitung (Admin) | `admin@tippkick.local`   | Wert aus `ADMIN_PASSWORD` (`.env`, Default `change-me`) |
| Demo-Tipper         | `cordoba@tippkick.local` | `demo1234`                                              |

> In der Entwicklung werden E-Mails (Verifizierung, Passwort-Reset) nur in der
> Konsole ausgegeben, solange keine `SMTP_*`-Werte gesetzt sind.

## Befehle

| Befehl                              | Wirkung                        |
| ----------------------------------- | ------------------------------ |
| `pnpm dev`                          | Dev-Server                     |
| `pnpm build`                        | Production-Build               |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                         |
| `pnpm typecheck`                    | TypeScript-Prüfung             |
| `pnpm format` / `pnpm format:check` | Prettier (120 Zeichen)         |
| `pnpm db:migrate`                   | Migration + Client-Generierung |
| `pnpm db:seed`                      | Seed (Spieltag 34 + Nutzer)    |
| `pnpm db:studio`                    | Prisma Studio                  |

## Bereiche

- **Tipper** (`/dashboard`, `/tippen`): Dashboard listet Wettbewerbe je mit aktivem
  Spieltag + Tipp-Fortschritt. `/tippen` mit **Wettbewerbs-Tabs** (BL, L2, …) und
  **Spieltag-Pagination**; Tipp-Maske mit Autosave, Deadline-Lock (serverseitig).
- **Tippleitung/Admin** (`/admin`): Spieltage **aus OpenLigaDB laden** (BL/L2/CL/DFB),
  manuell anlegen, Partien verwalten, Spieltag aktivieren. **Tipps als Excel**:
  BL/L2 im Original-Auswertungsformat inkl. aller **1386 Formeln** (Punkte/Rangliste
  rechnen automatisch, sobald die Tippleitung die Ergebnisse einträgt); andere
  Wettbewerbe im generischen Layout.
- **Einstellungen** (`/einstellungen`): Profilbild-Upload, E-Mail-Änderung (mit
  Neu-Verifizierung), Passwort-Änderung.
- **Dark Mode** über den Umschalter in der Nav.

## Datenmodell (Phase 2)

`Season → Competition → Matchday → Fixture`, `Tip`. Wettbewerbs-Keys
(BL/L2/CL/DFB/EM/WM) und OpenLigaDB-Shortcuts sind SSOT in `src/lib/constants.ts`.
Excel-Master-Vorlage: `src/lib/excel/template/auswertung-template.xlsx`.

## Architektur-Hinweise

- `src/lib/` = Geschäftslogik (SSOT): `tipps.ts`, `matchdays.ts`, `admin.ts`,
  `openligadb.ts`, `constants.ts`, `datetime.ts`, `session.ts`, `auth.ts`, `excel/`.
- `src/app/` = Routing/Seiten; `src/components/` = reine UI.
- Sicherheit (Deadline, Admin/Rollen) wird serverseitig erzwogen, nie nur im UI.
- Auth-Tabellen gehören better-auth; Domain-Tabellen (Season/Competition/Matchday/
  Fixture/Tip) liegen im selben Schema (`prisma/schema.prisma`).
- Dev-DB wird per `prisma db push` synchronisiert (keine Migrationshistorie);
  für Prod später `migrate diff`/`migrate deploy` anlegen.
