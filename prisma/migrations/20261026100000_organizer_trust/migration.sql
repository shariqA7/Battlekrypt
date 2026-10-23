-- Organizer trust: starter limits, graduation, winner-confirmed payouts.

ALTER TABLE "Tournament" ADD COLUMN "completedAt" TIMESTAMP(3);
-- Best available completion time for tournaments that finished before this column existed.
UPDATE "Tournament" SET "completedAt" = "updatedAt" WHERE "status" = 'completed' AND "completedAt" IS NULL;

ALTER TABLE "OrganizerProfile" ADD COLUMN "limitsLifted" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "PayoutStatus" AS ENUM ('paid_by_organizer', 'confirmed', 'disputed');

CREATE TABLE "PrizePayout" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'paid_by_organizer',
    "organizerMarkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winnerRespondedAt" TIMESTAMP(3),
    "winnerNote" TEXT,
    "adminNote" TEXT,
    CONSTRAINT "PrizePayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PrizePayout_registrationId_key" ON "PrizePayout"("registrationId");
CREATE INDEX "PrizePayout_tournamentId_idx" ON "PrizePayout"("tournamentId");
CREATE INDEX "PrizePayout_status_idx" ON "PrizePayout"("status");
ALTER TABLE "PrizePayout" ADD CONSTRAINT "PrizePayout_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrizePayout" ADD CONSTRAINT "PrizePayout_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrganizerTrustConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "starterMaxEntryFeeUsd" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "starterMaxPrizeUsd" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "starterMaxPaidEntrants" INTEGER NOT NULL DEFAULT 50,
    "graduationEvents" INTEGER NOT NULL DEFAULT 3,
    "payoutGraceDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizerTrustConfig_pkey" PRIMARY KEY ("id")
);
