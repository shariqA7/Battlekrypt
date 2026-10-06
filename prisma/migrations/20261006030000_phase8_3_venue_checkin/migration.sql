-- Phase 8.3: Online vs LAN venue + on-site check-in (spec §8).
CREATE TYPE "VenueType" AS ENUM ('online', 'lan');
CREATE TYPE "CheckInStatus" AS ENUM ('pending', 'checked_in', 'no_show');

ALTER TABLE "Tournament"
  ADD COLUMN "venueType" "VenueType" NOT NULL DEFAULT 'online',
  ADD COLUMN "venueName" TEXT,
  ADD COLUMN "venueAddress" TEXT,
  ADD COLUMN "venueCity" TEXT,
  ADD COLUMN "checkInOpensAt" TIMESTAMP(3),
  ADD COLUMN "checkInClosesAt" TIMESTAMP(3),
  ADD COLUMN "checkInCode" TEXT;

ALTER TABLE "TournamentTemplate"
  ADD COLUMN "venueType" "VenueType" NOT NULL DEFAULT 'online';

ALTER TABLE "Registration"
  ADD COLUMN "checkInStatus" "CheckInStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "checkedInAt" TIMESTAMP(3),
  ADD COLUMN "checkInAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Tournament_venueType_idx" ON "Tournament"("venueType");
