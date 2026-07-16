-- Schema-Hardening: CHECK-Constraints + User.role -> enum (SSOT).
-- Dieses Migration-File muss via `prisma migrate deploy` ausgeführt werden
-- (in Dev: `prisma migrate dev` legt sie automatisch an).

-- 1) User.role: String -> Role enum (vorhandene Werte lowercase 'user'/'admin'
--    passen 1:1 in die Enum-Werte).
CREATE TYPE "Role" AS ENUM ('user', 'admin');
ALTER TABLE "user"
  ALTER COLUMN "role" TYPE "Role"
  USING "role"::"Role";

-- 2) Tip.homeGoals/Tip.awayGoals: DB-Check als defense-in-depth.
--    normalizeGoals() klemmt clientseitig, aber direkter DB-Write
--    (Migrations, Admin-Skripte) wäre sonst ungebremst.
ALTER TABLE "Tip"
  ADD CONSTRAINT "Tip_goals_check"
  CHECK ("homeGoals" BETWEEN 0 AND 99 AND "awayGoals" BETWEEN 0 AND 99);

-- 3) Matchday: Datum-Invarianten.
ALTER TABLE "Matchday"
  ADD CONSTRAINT "Matchday_span_check"
  CHECK ("startDate" <= "endDate");

ALTER TABLE "Matchday"
  ADD CONSTRAINT "Matchday_deadline_check"
  CHECK ("deadlineAt" >= "startDate" - INTERVAL '7 days'
         AND "deadlineAt" <= "endDate" + INTERVAL '12 hours');
