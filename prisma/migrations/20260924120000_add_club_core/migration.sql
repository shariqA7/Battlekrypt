-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "TeamEntry" ADD COLUMN     "clubId" TEXT;

-- CreateTable
CREATE TABLE "ClubProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "status" "ClubStatus" NOT NULL DEFAULT 'pending',
    "feeProofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubRoster" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubRoster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubProfile_userId_key" ON "ClubProfile"("userId");

-- CreateIndex
CREATE INDEX "ClubRoster_clubId_gameId_idx" ON "ClubRoster"("clubId", "gameId");

-- CreateIndex
CREATE INDEX "ClubRoster_playerId_idx" ON "ClubRoster"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubRoster_clubId_playerId_gameId_key" ON "ClubRoster"("clubId", "playerId", "gameId");

-- AddForeignKey
ALTER TABLE "ClubProfile" ADD CONSTRAINT "ClubProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRoster" ADD CONSTRAINT "ClubRoster_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ClubProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRoster" ADD CONSTRAINT "ClubRoster_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRoster" ADD CONSTRAINT "ClubRoster_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntry" ADD CONSTRAINT "TeamEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ClubProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
