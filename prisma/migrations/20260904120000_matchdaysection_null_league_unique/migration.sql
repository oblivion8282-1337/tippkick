/*
Eindeutigkeit (competitionId, league, number) greift in Postgres bei league = NULL
nicht (NULL != NULL) — jeder Import-Lauf legte für CL/DFB neue Sektionen an.
Partial-Index erzwingt die Eindeutigkeit DB-seitig für Nicht-Bundesliga-Wettbewerbe.
*/
-- DropIndex
DROP INDEX IF EXISTS "MatchdaySection_competitionId_league_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "MatchdaySection_competitionId_league_number_key" ON "MatchdaySection"("competitionId", "league", "number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "matchdaysection_comp_number_null_league" ON "MatchdaySection"("competitionId", "number") WHERE "league" IS NULL;
