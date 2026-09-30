-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('organizer', 'club', 'player');

-- CreateEnum
CREATE TYPE "PlanRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "planCode" TEXT NOT NULL DEFAULT 'player_free',
ADD COLUMN     "planExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrganizerProfile" ADD COLUMN     "planCode" TEXT NOT NULL DEFAULT 'organizer_free',
ADD COLUMN     "planExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClubProfile" ADD COLUMN     "planExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "adsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planPaymentInstructions" TEXT;

-- CreateTable
CREATE TABLE "Plan" (
    "code" TEXT NOT NULL,
    "audience" "PlanAudience" NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "priceAmount" DECIMAL(14,2),
    "priceCurrency" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "PlanRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audience" "PlanAudience" NOT NULL,
    "planCode" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "status" "PlanRequestStatus" NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plan_audience_sortOrder_idx" ON "Plan"("audience", "sortOrder");

-- CreateIndex
CREATE INDEX "PlanRequest_status_createdAt_idx" ON "PlanRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlanRequest_userId_audience_idx" ON "PlanRequest"("userId", "audience");

-- AddForeignKey
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Starter plans (spec §7). Prices and limits are PLACEHOLDERS: they live in
-- this table so an admin can tune them from the admin panel after launch.
INSERT INTO "Plan" ("code", "audience", "name", "isPaid", "priceAmount", "priceCurrency", "durationDays", "limits", "sortOrder", "updatedAt") VALUES
  ('organizer_free', 'organizer', 'Organizer Free', false, NULL, NULL, 30,
   '{"maxTournamentsPerMonth":3,"maxGames":2,"maxTemplates":1,"advancedAnalytics":false,"prioritySupport":false}', 0, CURRENT_TIMESTAMP),
  ('organizer_pro', 'organizer', 'Organizer Pro', true, 2000, 'PKR', 30,
   '{"maxTournamentsPerMonth":null,"maxGames":null,"maxTemplates":null,"advancedAnalytics":true,"prioritySupport":true}', 1, CURRENT_TIMESTAMP),
  ('club_free', 'club', 'Club Free', false, NULL, NULL, 30,
   '{"maxEntriesPerGame":1,"maxGames":2,"maxPlayersPerTeam":6,"maxSubstitutesPerTeam":0,"canSetCoach":false,"merchStore":false,"enhancedProfile":false}', 0, CURRENT_TIMESTAMP),
  ('club_pro', 'club', 'Club Pro', true, 3000, 'PKR', 30,
   '{"maxEntriesPerGame":null,"maxGames":null,"maxPlayersPerTeam":6,"maxSubstitutesPerTeam":2,"canSetCoach":true,"merchStore":true,"enhancedProfile":true}', 1, CURRENT_TIMESTAMP),
  ('player_free', 'player', 'Player Free', false, NULL, NULL, 30,
   '{"priorityRegistration":false,"extendedStats":false}', 0, CURRENT_TIMESTAMP),
  ('player_plus', 'player', 'Player Plus', true, 500, 'PKR', 30,
   '{"priorityRegistration":true,"extendedStats":true}', 1, CURRENT_TIMESTAMP);
