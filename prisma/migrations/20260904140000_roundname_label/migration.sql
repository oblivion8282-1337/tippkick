-- Rundenname aus OpenLigaDB je Spieltag („1. Runde", „Achtelfinale") + ableitbarer
-- Tipptag-Label (statt blutiger Nummer) fuer K.-o.-Runden.
ALTER TABLE "MatchdaySection" ADD COLUMN "roundName" TEXT;
ALTER TABLE "Matchday" ADD COLUMN "label" TEXT;
