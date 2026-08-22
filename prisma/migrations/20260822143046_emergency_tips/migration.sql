-- CreateTable
CREATE TABLE "EmergencyTip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultHome" INTEGER NOT NULL DEFAULT 2,
    "defaultAway" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyTeamRule" (
    "id" TEXT NOT NULL,
    "emergencyId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "goalsFor" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyTeamRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyTip_userId_key" ON "EmergencyTip"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyTeamRule_emergencyId_teamName_key" ON "EmergencyTeamRule"("emergencyId", "teamName");

-- AddForeignKey
ALTER TABLE "EmergencyTip" ADD CONSTRAINT "EmergencyTip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyTeamRule" ADD CONSTRAINT "EmergencyTeamRule_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "EmergencyTip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
