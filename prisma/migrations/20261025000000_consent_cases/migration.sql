-- Guardian withdrew consent mid-tournament: an admin decides what happens to the entry.

CREATE TYPE "ConsentCaseStatus" AS ENUM ('open', 'allowed', 'removed');

CREATE TABLE "ConsentCase" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "ConsentCaseStatus" NOT NULL DEFAULT 'open',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsentCase_registrationId_key" ON "ConsentCase"("registrationId");
CREATE INDEX "ConsentCase_status_createdAt_idx" ON "ConsentCase"("status", "createdAt");
ALTER TABLE "ConsentCase" ADD CONSTRAINT "ConsentCase_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
