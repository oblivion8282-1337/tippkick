# Tippkick-Portal — Projekt-Leitlinien

Web-Plattform für einen Fußball-Tippverein. Ersetzt die Email-/Excel-Tippabwicklung:
Tipper tippen online, die Tippleitung lädt eine fertige Auswertungs-Excel herunter.
Stack: **Next.js (App Router, TypeScript) · Prisma · PostgreSQL · Tailwind + shadcn/ui · better-auth · ExcelJS**.

> **Aktueller Stand:** Phase 1 (MVP) — Tipps sammeln + Excel-Export. Später erweiterbar um
> Vereinszeitung, Foto-Galerien, Reminder-Mails, Punkte/Rangliste. Architektur so halten,
> dass diese Module andocken können, ohne bestehenden Code zu berühren.

---

## Befehle

Alle Befehle im Verzeichnis `tippkick/` ausführen.

```bash
docker compose up -d db        # Postgres starten
pnpm install                   # Abhängigkeiten installieren
pnpm db:migrate                # Migration anwenden + Prisma-Client generieren
pnpm db:seed                   # Seed (Spieltag 34 + Admin + Demo-Tipper 'Cordoba')
pnpm dev                       # Next.js Dev-Server (localhost:3000)
pnpm build                     # Production-Build
pnpm lint                      # ESLint
pnpm typecheck                 # tsc --noEmit
```

---

## Repository

Das Projekt ist ein Git-Repo (GitHub: `oblivion8282-1337/tippkick`). Remote/URL
sieht man mit `git remote -v` — nicht hier duplizieren.

- **Direkt auf `main` arbeiten** (Solo-Projekt): Feature-Branches werden nicht
  genutzt. Nach dem Verify+Simplify-Workflow direkt auf `main` committen + pushen.
- **Caveat:** Die Claude-Code-Environment-Erkennung meldet diese Session manchmal
  fälschlich als „kein Git-Repo". Ignorieren — `.git` ist vorhanden; der
  Commit-Schritt aus dem Workflow entfällt nicht.

---

## Architektur & Single Source of Truth (SSOT)

**Kein Spaghetti-Code.** Klare Trennung pro Verantwortung:

- `src/app/` — ausschließlich Routing & Seiten. Keine Geschäftslogik hier.
- `src/lib/` — Geschäftslogik, Services, DB-Zugriff. **Eine Logik existiert genau einmal.**
- `src/components/` — reine UI-Komponenten. Rufen Services/Server Actions auf, enthalten selbst keine Logik.

**SSOT-Regeln:**

- **Datenmodell** ist die Wahrheit → `prisma/schema.prisma`. Typen stammen aus `prisma generate`, nicht selbst nachgebaut.
- **Konstanten & Enums** (Ligen, Rollen, Punkte-Regeln) **an einem Ort** (`lib/constants.ts` bzw. Prisma-Enum). Nirgendwo als Magic Strings/Numbers dupliziert.
- **Geschäftslogik server-seitig & zentral** (z. B. Deadline-Lock in `lib/`). Die UI ruft nur auf, entscheidet nie selbst über Sicherheit.
- **Sicherheit wird server-seitig erzwungen**, nie nur im UI (z. B. read-only nach Deadline auch am Server prüfen).

---

## Code-Konventionen

- **Max. Zeilenlänge: 120 Zeichen.** Maschinell durchgesetzt via Prettier (`printWidth: 120`) + ESLint.
- **TypeScript `strict: true`.** Keine `any` ohne Begründung im Kommentar.
- **Server Components sind der Default.** `"use client"` nur dort, wo Interaktion nötig ist (Formulare, Autosave, Countdown).
- **Prisma:** Singleton-Client (`lib/prisma.ts`); zusammengesetzte Schreibvorgänge in Transaktionen (`prisma.$transaction`).
- **Formatierung:** Prettier mit `singleQuote`, `semi: true`, `trailingComma: 'all'`.
- **Dateinamen:** `kebab-case` für Dateien, `PascalCase` für Komponenten.

---

## Workflow — verbindlich nach JEDEM Programmiervorgang

1. **Verifikationsdurchgang:** `pnpm lint` + `pnpm typecheck` sauber, ggf. `pnpm build`/Test.
   Den betroffenen Flow kurz angetrieben (nicht nur kompiliert). **Fehler werden vor dem Weitermachen behoben.**
2. **Code-Simplifier:** `/simplify` (bzw. code-simplifier-Agent) auf dem geänderten Code ausführen —
   Duplikate, SSOT-Verstöße und unnötige Komplexität entfernen.
3. **Erst dann** committen. Kleine, thematische Commits (ein Feature = ein Commit).

---

## Modulgrenzen (für spätere Erweiterung)

Jedes Feature bleibt in seinem Bereich, damit es unabhängig wachsen kann:
`tippspiel`, `admin`, `auth`, `export` jetzt — `zeitung`, `galerie`, `reminders`, `auswertung` später.
Neue Module bekommen eigene Tabellen/Services/Seiten und greifen nicht in bestehende Logik ein.

---

## Excel-Export — Format-Referenz

Der Export reproduziert das **`34.TT`-Blatt** aus `Vorlagen/34_TT_Auswertung.xlsx`:
- Master-Spalten Heim `:` Gast pro Partie, gruppiert nach 1. Liga / 2. Liga.
- **Pro Tipper ein 6-Spalten-Block** im Abstand von 6 Spalten (Tipp Heim `:` Gast + leere Punkte-Spalten).
- Ergebnis-/Punkte-Spalten bleiben leer (füllt die Tippleitung).
- Die Vorlage ist die Referenz für das exakte Layout — bei Unklarheiten `Vorlagen/34_TT_Auswertung.xlsx` auslesen.
