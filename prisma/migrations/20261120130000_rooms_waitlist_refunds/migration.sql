-- Rooms inside a tournament, a waiting list when every seat is taken, a payment window for teams
-- promoted off the waiting list, and withdrawals with an organizer-chosen refund policy.
-- Nothing is dropped or rewritten: existing tournaments keep working as one pool of maxTeams seats.

-- 1. New registration states
ALTER TYPE "RegistrationStatus" ADD VALUE IF NOT EXISTS 'waitlisted';
ALTER TYPE "RegistrationStatus" ADD VALUE IF NOT EXISTS 'withdrawn';

-- 2. New enums
CREATE TYPE "RefundPolicy" AS ENUM ('organizer_decides', 'no_refund', 'full_before_cutoff', 'if_resold');
CREATE TYPE "RefundStatus" AS ENUM ('not_applicable', 'requested', 'waiting_resale', 'owed', 'refunded', 'declined');

-- 3. Tournament settings
ALTER TABLE "Tournament" ADD COLUMN "teamsPerRoom" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tournament" ADD COLUMN "payWindowMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Tournament" ADD COLUMN "refundPolicy" "RefundPolicy" NOT NULL DEFAULT 'organizer_decides';
ALTER TABLE "Tournament" ADD COLUMN "refundCutoffHours" INTEGER NOT NULL DEFAULT 24;

-- 4. Rooms
CREATE TABLE "TournamentRoom" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "startAt" TIMESTAMP(3),
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentRoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TournamentRoom_tournamentId_number_key" ON "TournamentRoom"("tournamentId", "number");
CREATE INDEX "TournamentRoom_tournamentId_startAt_idx" ON "TournamentRoom"("tournamentId", "startAt");
ALTER TABLE "TournamentRoom" ADD CONSTRAINT "TournamentRoom_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Registration: room, waiting list, payment window, withdrawal and refund
ALTER TABLE "Registration" ADD COLUMN "roomId" TEXT;
ALTER TABLE "Registration" ADD COLUMN "waitlistedAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "promotedAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "payDueAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "withdrawReason" TEXT;
ALTER TABLE "Registration" ADD COLUMN "releaseReason" TEXT;
ALTER TABLE "Registration" ADD COLUMN "refundStatus" "RefundStatus" NOT NULL DEFAULT 'not_applicable';
ALTER TABLE "Registration" ADD COLUMN "refundDecidedAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "refundedAt" TIMESTAMP(3);
CREATE INDEX "Registration_tournamentId_status_waitlistedAt_idx" ON "Registration"("tournamentId", "status", "waitlistedAt");
CREATE INDEX "Registration_roomId_idx" ON "Registration"("roomId");
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "TournamentRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
