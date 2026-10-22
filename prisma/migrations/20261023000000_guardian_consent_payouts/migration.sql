-- Guardian consent: a "manage" link for withdrawing, and where prizes are paid.

ALTER TABLE "ParentalConsent" ADD COLUMN "manageTokenHash" TEXT;
ALTER TABLE "ParentalConsent" ADD COLUMN "revokedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ParentalConsent_manageTokenHash_key" ON "ParentalConsent"("manageTokenHash");

CREATE TYPE "PayoutPayee" AS ENUM ('self', 'guardian');

CREATE TABLE "PlayerPayoutMethod" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "payee" "PayoutPayee" NOT NULL DEFAULT 'self',
    "payeeName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "detailsEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerPayoutMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerPayoutMethod_playerId_key" ON "PlayerPayoutMethod"("playerId");
ALTER TABLE "PlayerPayoutMethod" ADD CONSTRAINT "PlayerPayoutMethod_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
