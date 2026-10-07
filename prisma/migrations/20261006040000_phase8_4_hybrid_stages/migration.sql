-- Phase 8.4: hybrid tournaments — venue per stage + advancement between stages.
ALTER TYPE "VenueType" ADD VALUE 'hybrid';

ALTER TABLE "Stage"
  ADD COLUMN "venueType" "VenueType" NOT NULL DEFAULT 'online',
  ADD COLUMN "venueName" TEXT,
  ADD COLUMN "venueAddress" TEXT,
  ADD COLUMN "venueCity" TEXT,
  ADD COLUMN "checkInOpensAt" TIMESTAMP(3),
  ADD COLUMN "checkInClosesAt" TIMESTAMP(3),
  ADD COLUMN "checkInCode" TEXT,
  ADD COLUMN "restricted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StageEntry" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "checkInStatus" "CheckInStatus" NOT NULL DEFAULT 'pending',
    "checkedInAt" TIMESTAMP(3),
    "checkInAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StageEntry_stageId_registrationId_key" ON "StageEntry"("stageId", "registrationId");
CREATE INDEX "StageEntry_registrationId_idx" ON "StageEntry"("registrationId");

ALTER TABLE "StageEntry" ADD CONSTRAINT "StageEntry_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageEntry" ADD CONSTRAINT "StageEntry_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
