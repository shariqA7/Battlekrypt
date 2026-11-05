ALTER TABLE "SiteSettings"
    ADD COLUMN "giveawaysEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "giveawaysVerifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "giveawayReviewAboveUsd" DECIMAL(12,2) NOT NULL DEFAULT 50,
    ADD COLUMN "giveawayClaimDays" INTEGER NOT NULL DEFAULT 14;

CREATE TYPE "GiveawayHost" AS ENUM ('platform', 'organizer');
CREATE TYPE "GiveawayStatus" AS ENUM ('draft', 'pending_review', 'active', 'ended', 'cancelled', 'rejected');
CREATE TYPE "GiveawayPrizeKind" AS ENUM ('physical', 'code', 'cash');
CREATE TYPE "GiveawayWinnerStatus" AS ENUM ('awaiting_details', 'details_submitted', 'delivered', 'confirmed', 'disputed', 'replaced');

CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hostType" "GiveawayHost" NOT NULL,
    "organizerId" TEXT,
    "createdById" TEXT NOT NULL,
    "sponsorName" TEXT,
    "sponsorLogoUrl" TEXT,
    "sponsorUrl" TEXT,
    "prizeKind" "GiveawayPrizeKind" NOT NULL,
    "prizeTitle" TEXT NOT NULL,
    "prizeValueUsd" DECIMAL(12,2),
    "prizeImageUrl" TEXT,
    "winnersCount" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "verifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "tournamentId" TEXT,
    "status" "GiveawayStatus" NOT NULL DEFAULT 'active',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "drawnById" TEXT,
    "cancelledNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Giveaway_winnersCount_check" CHECK ("winnersCount" BETWEEN 1 AND 100),
    CONSTRAINT "Giveaway_host_check" CHECK (("hostType" = 'organizer') = ("organizerId" IS NOT NULL))
);
CREATE UNIQUE INDEX "Giveaway_slug_key" ON "Giveaway"("slug");
CREATE INDEX "Giveaway_status_endsAt_idx" ON "Giveaway"("status", "endsAt");
CREATE INDEX "Giveaway_organizerId_createdAt_idx" ON "Giveaway"("organizerId", "createdAt");
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_userId_key" ON "GiveawayEntry"("giveawayId", "userId");
CREATE INDEX "GiveawayEntry_userId_createdAt_idx" ON "GiveawayEntry"("userId", "createdAt");
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GiveawayWinner" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GiveawayWinnerStatus" NOT NULL DEFAULT 'awaiting_details',
    "claimDeadline" TIMESTAMP(3) NOT NULL,
    "deliveryName" TEXT,
    "deliveryPhone" TEXT,
    "deliveryAddress" TEXT,
    "deliveryNote" TEXT,
    "hostNote" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "disputeNote" TEXT,
    "replacedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiveawayWinner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GiveawayWinner_giveawayId_userId_key" ON "GiveawayWinner"("giveawayId", "userId");
CREATE INDEX "GiveawayWinner_userId_status_idx" ON "GiveawayWinner"("userId", "status");
CREATE INDEX "GiveawayWinner_giveawayId_status_idx" ON "GiveawayWinner"("giveawayId", "status");
ALTER TABLE "GiveawayWinner" ADD CONSTRAINT "GiveawayWinner_giveawayId_fkey"
    FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayWinner" ADD CONSTRAINT "GiveawayWinner_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Giveaways an organization may run per month, by plan. "limits || ..." merges into what the plan has.
UPDATE "Plan" SET "limits" = "limits" || '{"maxGiveawaysPerMonth":1}'::jsonb WHERE "code" = 'organizer_free';
UPDATE "Plan" SET "limits" = "limits" || '{"maxGiveawaysPerMonth":3}'::jsonb WHERE "code" = 'organizer_basic';
UPDATE "Plan" SET "limits" = "limits" || '{"maxGiveawaysPerMonth":10}'::jsonb WHERE "code" = 'organizer_pro';
UPDATE "Plan" SET "limits" = "limits" || '{"maxGiveawaysPerMonth":null}'::jsonb WHERE "code" = 'organizer_business';
