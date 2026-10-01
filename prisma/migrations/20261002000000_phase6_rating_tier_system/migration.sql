-- CreateEnum
CREATE TYPE "TierSettingScope" AS ENUM ('world', 'region', 'country');

-- CreateEnum
CREATE TYPE "TierPublishPath" AS ENUM ('instant', 'admin_review', 'always_admin');

-- AlterTable
ALTER TABLE "OrganizerProfile" ADD COLUMN     "country" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "ClubTeam" ADD COLUMN     "rating" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "submittedForReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompetitiveTierSetting" (
    "id" TEXT NOT NULL,
    "tier" "CompetitiveTier" NOT NULL,
    "scope" "TierSettingScope" NOT NULL,
    "scopeValue" TEXT,
    "minPrizePoolUsd" DECIMAL(14,2) NOT NULL,
    "minRating" INTEGER,
    "minWins" INTEGER,
    "publishPath" "TierPublishPath" NOT NULL DEFAULT 'instant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitiveTierSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameRating" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGameRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitiveTierSetting_tier_scope_scopeValue_key" ON "CompetitiveTierSetting"("tier", "scope", "scopeValue");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameRating_playerId_gameId_key" ON "PlayerGameRating"("playerId", "gameId");

-- AddForeignKey
ALTER TABLE "PlayerGameRating" ADD CONSTRAINT "PlayerGameRating_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameRating" ADD CONSTRAINT "PlayerGameRating_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
