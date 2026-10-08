-- Institution-only challenges: co-host/guest institutes, per-institute application
-- limits, and an institute review step on each application.

-- CreateEnum
CREATE TYPE "InstituteReview" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Challenge"
    ADD COLUMN "audienceScope" "AudienceScope" NOT NULL DEFAULT 'open',
    ADD COLUMN "maxApplicationsPerInstitute" INTEGER;

-- AlterTable
ALTER TABLE "ChallengeApplication"
    ADD COLUMN "institutionId" TEXT,
    ADD COLUMN "routedInstitutionId" TEXT,
    ADD COLUMN "institutionReview" "InstituteReview" NOT NULL DEFAULT 'approved',
    ADD COLUMN "approvedByInstitutionId" TEXT;

-- CreateTable
CREATE TABLE "ChallengeInstitution" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "role" "CoHostRole" NOT NULL,
    "status" "CoHostStatus" NOT NULL DEFAULT 'pending',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "maxApplications" INTEGER,

    CONSTRAINT "ChallengeInstitution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChallengeInstitution_institutionId_status_idx" ON "ChallengeInstitution"("institutionId", "status");
CREATE UNIQUE INDEX "ChallengeInstitution_challengeId_institutionId_key" ON "ChallengeInstitution"("challengeId", "institutionId");
CREATE INDEX "ChallengeApplication_challengeId_institutionId_idx" ON "ChallengeApplication"("challengeId", "institutionId");

-- AddForeignKey
ALTER TABLE "ChallengeApplication" ADD CONSTRAINT "ChallengeApplication_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChallengeApplication" ADD CONSTRAINT "ChallengeApplication_routedInstitutionId_fkey" FOREIGN KEY ("routedInstitutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChallengeInstitution" ADD CONSTRAINT "ChallengeInstitution_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeInstitution" ADD CONSTRAINT "ChallengeInstitution_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
