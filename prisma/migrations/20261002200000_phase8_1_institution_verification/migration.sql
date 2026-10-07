-- Phase 8.1: one institution verification per player (spec §8).

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "PlayerInstitution" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "studentId" TEXT,
    "idImagePath" TEXT NOT NULL,
    "status" "InstitutionStatus" NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerInstitution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInstitution_playerId_key" ON "PlayerInstitution"("playerId");

-- CreateIndex
CREATE INDEX "PlayerInstitution_status_idx" ON "PlayerInstitution"("status");

-- AddForeignKey
ALTER TABLE "PlayerInstitution" ADD CONSTRAINT "PlayerInstitution_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
