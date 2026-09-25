/*
  Warnings:

  - A unique constraint covering the columns `[playerId]` on the table `ClubRoster` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ClubRosterRole" AS ENUM ('player', 'substitute');

-- CreateEnum
CREATE TYPE "ClubInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- DropIndex
DROP INDEX "ClubRoster_clubId_playerId_gameId_key";

-- DropIndex
DROP INDEX "ClubRoster_playerId_idx";

-- AlterTable
ALTER TABLE "ClubRoster" ADD COLUMN     "role" "ClubRosterRole" NOT NULL DEFAULT 'player',
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "clubPaymentInstructions" TEXT;

-- CreateTable
CREATE TABLE "ClubTeam" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coachName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubInvite" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT,
    "role" "ClubRosterRole" NOT NULL DEFAULT 'player',
    "status" "ClubInviteStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ClubInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubTeam_clubId_gameId_idx" ON "ClubTeam"("clubId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubTeam_clubId_gameId_name_key" ON "ClubTeam"("clubId", "gameId", "name");

-- CreateIndex
CREATE INDEX "ClubInvite_playerId_status_idx" ON "ClubInvite"("playerId", "status");

-- CreateIndex
CREATE INDEX "ClubInvite_clubId_status_idx" ON "ClubInvite"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubRoster_playerId_key" ON "ClubRoster"("playerId");

-- CreateIndex
CREATE INDEX "ClubRoster_teamId_idx" ON "ClubRoster"("teamId");

-- AddForeignKey
ALTER TABLE "ClubTeam" ADD CONSTRAINT "ClubTeam_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ClubProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTeam" ADD CONSTRAINT "ClubTeam_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRoster" ADD CONSTRAINT "ClubRoster_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ClubTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ClubProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ClubTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
