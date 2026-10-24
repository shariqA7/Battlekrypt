-- Organizer identity verification (NIC / passport) with retention settings.

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "IdentityDocType" AS ENUM ('nic', 'passport');

-- AlterTable
ALTER TABLE "OrganizerTrustConfig"
  ADD COLUMN "idRetentionDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "idRejectedRetentionDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "idValidityMonths" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'pending',
    "docType" "IdentityDocType" NOT NULL,
    "fullName" TEXT,
    "documentNumber" TEXT,
    "frontPath" TEXT,
    "backPath" TEXT,
    "selfiePath" TEXT,
    "idNumberHash" TEXT,
    "over18Confirmed" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "rejectionNote" TEXT,
    "retentionHold" BOOLEAN NOT NULL DEFAULT false,
    "purgeAfter" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerification_organizerId_key" ON "IdentityVerification"("organizerId");

-- CreateIndex
CREATE INDEX "IdentityVerification_idNumberHash_idx" ON "IdentityVerification"("idNumberHash");

-- CreateIndex
CREATE INDEX "IdentityVerification_status_purgeAfter_idx" ON "IdentityVerification"("status", "purgeAfter");

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
