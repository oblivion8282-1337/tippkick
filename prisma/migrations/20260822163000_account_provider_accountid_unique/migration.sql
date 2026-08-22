-- better-auth Login-Lookup: (providerId, accountId) eindeutig (Duplikate geprüft: keine)
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
