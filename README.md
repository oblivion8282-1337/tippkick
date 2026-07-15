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

- **Tipper** (`/dashboard`, `/tippen/[matchdayId]`): aktiver Spieltag, Tipp-Maske mit
  Autosave, Deadline-Lock (server-seitig erzwungen).
- **Tippleitung/Admin** (`/admin`): Spieltage + Partien verwalten, Spieltag aktivieren,
  **Tipps als Excel** herunterladen (`/admin/matchdays/[id]/export`) – im Layout der
  gewohnten Auswertung, eine Spalte pro Tipper.

## Architektur-Hinweise

- `src/lib/` = Geschäftslogik (SSOT): `tipps.ts`, `matchdays.ts`, `admin.ts`,
  `session.ts`, `auth.ts`, `excel/`.
- `src/app/` = Routing/Seiten; `src/components/` = reine UI.
- Sicherheit (Deadline, Admin/Rollen) wird server-seitig erzwungen, nie nur im UI.
- Auth-Tabellen gehören better-auth; Domain-Tabellen (Season/Matchday/Fixture/Tip)
  liegen im selben Schema (`prisma/schema.prisma`).
