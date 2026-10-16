-- Parental consent for under-18 players (off unless the platform switch is on).
ALTER TABLE "Tournament" ADD COLUMN "requireParentalConsent" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "ParentalConsentStatus" AS ENUM ('pending', 'approved', 'declined', 'revoked', 'superseded');

CREATE TABLE "ParentalConsent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ParentalConsentStatus" NOT NULL DEFAULT 'pending',
    "requestedFor" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkExpiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "signedName" TEXT,
    "waiverVersion" TEXT,
    "waiverText" TEXT,
    "signedIp" TEXT,
    "signedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentalConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParentalConsent_tokenHash_key" ON "ParentalConsent"("tokenHash");
CREATE INDEX "ParentalConsent_playerId_status_idx" ON "ParentalConsent"("playerId", "status");

ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
