-- DB-seitiger Duplikatschutz: dieselbe OpenLigaDB-Partie pro Sektion nur einmal
-- (schützt parallele Imports Admin + Cron; existierende Duplikate wurden geprüft: keine).
CREATE UNIQUE INDEX "Fixture_sectionId_externalId_key" ON "Fixture"("sectionId", "externalId");
