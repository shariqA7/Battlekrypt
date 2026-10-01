-- CreateEnum
CREATE TYPE "OrgApplicationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('manager', 'staff');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('club_upgrade', 'org_plan', 'player_plan', 'other');

-- CreateEnum
CREATE TYPE "ClubNameClaimStatus" AS ENUM ('pending', 'upheld', 'dismissed');

-- CreateEnum
CREATE TYPE "ClubUpgradeStatus" AS ENUM ('none', 'pending', 'rejected');

-- AlterEnum
ALTER TYPE "ClubStatus" ADD VALUE 'disbanded';

-- AlterTable
ALTER TABLE "ClubProfile" ADD COLUMN     "disbandReason" TEXT,
ADD COLUMN     "disbandedAt" TIMESTAMP(3),
ADD COLUMN     "nameKey" TEXT,
ADD COLUMN     "upgradeStatus" "ClubUpgradeStatus" NOT NULL DEFAULT 'none',
ALTER COLUMN "status" SET DEFAULT 'approved';

-- CreateTable
CREATE TABLE "OrganizationApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "orgNameKey" TEXT NOT NULL,
    "orgType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "website" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "handlerName" TEXT NOT NULL,
    "handlerRole" TEXT NOT NULL,
    "handlerPhone" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'organizer_free',
    "status" "OrgApplicationStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "rejectionNote" TEXT,
    "fieldFeedback" JSONB,
    "nextResubmitAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'staff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "deviceType" TEXT NOT NULL,
    "os" TEXT,
    "browser" TEXT,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubNameClaim" (
    "id" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "clubId" TEXT,
    "explanation" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "ClubNameClaimStatus" NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "banDays" INTEGER,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubNameClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApplication_userId_key" ON "OrganizationApplication"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApplication_orgNameKey_key" ON "OrganizationApplication"("orgNameKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizerId_email_key" ON "OrganizationMember"("organizerId", "email");

-- CreateIndex
CREATE INDEX "VisitSession_createdAt_idx" ON "VisitSession"("createdAt");

-- CreateIndex
CREATE INDEX "VisitSession_userId_idx" ON "VisitSession"("userId");

-- CreateIndex
CREATE INDEX "VisitSession_country_idx" ON "VisitSession"("country");

-- CreateIndex
CREATE INDEX "PaymentRecord_createdAt_idx" ON "PaymentRecord"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_userId_idx" ON "PaymentRecord"("userId");

-- CreateIndex
CREATE INDEX "AccountBan_userId_idx" ON "AccountBan"("userId");

-- CreateIndex
CREATE INDEX "ClubNameClaim_nameKey_idx" ON "ClubNameClaim"("nameKey");

-- CreateIndex
CREATE INDEX "ClubNameClaim_claimantId_idx" ON "ClubNameClaim"("claimantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubProfile_nameKey_key" ON "ClubProfile"("nameKey");

-- AddForeignKey
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSession" ADD CONSTRAINT "VisitSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBan" ADD CONSTRAINT "AccountBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNameClaim" ADD CONSTRAINT "ClubNameClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing clubs under the old "admin approves every club" rule: clubs are now
-- created instantly on the free plan. A club that was still waiting (or was
-- rejected) becomes an active free club; if it had uploaded a fee proof, that
-- proof becomes a pending (or rejected) request for the paid plan so nothing
-- the owner paid for is lost.
UPDATE "ClubProfile"
SET "upgradeStatus" = CASE
      WHEN "feeProofUrl" IS NOT NULL AND "status" = 'pending' THEN 'pending'::"ClubUpgradeStatus"
      WHEN "feeProofUrl" IS NOT NULL AND "status" = 'rejected' THEN 'rejected'::"ClubUpgradeStatus"
      ELSE 'none'::"ClubUpgradeStatus"
    END,
    "status" = 'approved'
WHERE "status" IN ('pending', 'rejected');

-- New plan limit keys (same-name club for organizations, big dashboard
-- carousel) on the existing plans, plus the Basic and Business organization
-- tiers. Prices/limits are placeholders, editable in Admin > Plans.
UPDATE "Plan" SET "limits" = "limits" || '{"allowSameNameClub":false,"dashboardCarousel":false}'::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "code" = 'organizer_free';
UPDATE "Plan" SET "limits" = "limits" || '{"allowSameNameClub":true,"dashboardCarousel":true}'::jsonb, "sortOrder" = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE "code" = 'organizer_pro';
UPDATE "Plan" SET "limits" = "limits" || '{"dashboardCarousel":false}'::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "code" = 'club_free';
UPDATE "Plan" SET "limits" = "limits" || '{"dashboardCarousel":true}'::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "code" = 'club_pro';

INSERT INTO "Plan" ("code", "audience", "name", "isPaid", "priceAmount", "priceCurrency", "durationDays", "limits", "sortOrder", "updatedAt") VALUES
  ('organizer_basic', 'organizer', 'Organizer Basic', true, 1000, 'PKR', 30,
   '{"maxTournamentsPerMonth":10,"maxGames":5,"maxTemplates":5,"advancedAnalytics":false,"prioritySupport":false,"allowSameNameClub":true,"dashboardCarousel":true}', 1, CURRENT_TIMESTAMP),
  ('organizer_business', 'organizer', 'Organizer Business', true, 5000, 'PKR', 30,
   '{"maxTournamentsPerMonth":null,"maxGames":null,"maxTemplates":null,"advancedAnalytics":true,"prioritySupport":true,"allowSameNameClub":true,"dashboardCarousel":true}', 3, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "FeaturedSlide" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "linkUrl" TEXT,
    "organizerId" TEXT,
    "clubId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturedTournament" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedTournament_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeaturedSlide_isActive_position_idx" ON "FeaturedSlide"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedTournament_tournamentId_key" ON "FeaturedTournament"("tournamentId");

-- AddForeignKey
ALTER TABLE "FeaturedSlide" ADD CONSTRAINT "FeaturedSlide_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedSlide" ADD CONSTRAINT "FeaturedSlide_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ClubProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedTournament" ADD CONSTRAINT "FeaturedTournament_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
