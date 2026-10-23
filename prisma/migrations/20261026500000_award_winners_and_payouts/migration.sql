-- Award winners
ALTER TABLE "PrizeAward"
    ADD COLUMN "winnerUserId" TEXT,
    ADD COLUMN "winnerAssignedAt" TIMESTAMP(3);

-- Payouts can now be for an award (one player) as well as a placement
ALTER TABLE "PrizePayout" ALTER COLUMN "registrationId" DROP NOT NULL;
ALTER TABLE "PrizePayout"
    ADD COLUMN "awardId" TEXT,
    ADD COLUMN "recipientUserId" TEXT,
    ADD COLUMN "description" TEXT;
CREATE UNIQUE INDEX "PrizePayout_awardId_key" ON "PrizePayout"("awardId");
ALTER TABLE "PrizePayout" ADD CONSTRAINT "PrizePayout_awardId_fkey"
    FOREIGN KEY ("awardId") REFERENCES "PrizeAward"("id") ON DELETE SET NULL ON UPDATE CASCADE;
