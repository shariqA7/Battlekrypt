-- Challenges part 1.
--
-- Written to be safe to run more than once and on a database where an earlier
-- attempt got part-way (every create is "if not exists"), so it can be applied
-- with `prisma migrate deploy` whatever state the first attempt left behind.

-- Enums
DO $$ BEGIN
  CREATE TYPE "ChallengePosterType" AS ENUM ('organizer', 'club', 'player');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeEntrantType" AS ENUM ('player', 'team', 'either');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengePrizeType" AS ENUM ('cash', 'in_game', 'reward');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeStatus" AS ENUM ('pending_review', 'open', 'in_progress', 'completed', 'expired', 'cancelled', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Site settings: the prize amount (USD) above which a challenge waits for admin approval
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "challengeReviewUsd" DECIMAL(14,2) NOT NULL DEFAULT 10000;

-- Table
CREATE TABLE IF NOT EXISTS "Challenge" (
    "id" TEXT NOT NULL,
    "posterUserId" TEXT NOT NULL,
    "posterType" "ChallengePosterType" NOT NULL,
    "posterName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "entrantType" "ChallengeEntrantType" NOT NULL DEFAULT 'either',
    "minRating" INTEGER,
    "slots" INTEGER NOT NULL,
    "maxApplicants" INTEGER NOT NULL,
    "applicationsCloseAt" TIMESTAMP(3) NOT NULL,
    "completeWithinDays" INTEGER NOT NULL,
    "prizeType" "ChallengePrizeType" NOT NULL,
    "prizeDescription" TEXT NOT NULL,
    "cashAmount" DECIMAL(14,2),
    "cashCurrency" TEXT,
    "prizeUsd" DECIMAL(14,2),
    "payoutMethod" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'open',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Challenge_status_createdAt_idx" ON "Challenge"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Challenge_posterUserId_posterType_createdAt_idx" ON "Challenge"("posterUserId", "posterType", "createdAt");
CREATE INDEX IF NOT EXISTS "Challenge_gameId_idx" ON "Challenge"("gameId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_posterUserId_fkey" FOREIGN KEY ("posterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New Basic and Business plans. Organizer Basic/Business already exist (they
-- came with the organization-registration update, with prices and on sale), so
-- every insert is "do nothing if the plan code is taken" and existing plans
-- keep their price and on-sale setting. The club and player ones are created
-- OFF SALE with no price: set a price in Admin -> Settings -> Plans and tick
-- "On sale" to start selling them. Limits other than the challenge ones are
-- starting points to adjust there too.
INSERT INTO "Plan" ("code", "audience", "name", "isPaid", "priceAmount", "priceCurrency", "durationDays", "limits", "isActive", "sortOrder", "updatedAt") VALUES
  ('organizer_basic', 'organizer', 'Organizer Basic', true, NULL, NULL, 30,
   '{"maxTournamentsPerMonth":10,"maxGames":5,"maxTemplates":5,"advancedAnalytics":false,"prioritySupport":false,"allowSameNameClub":true,"dashboardCarousel":false}', false, 1, CURRENT_TIMESTAMP),
  ('organizer_business', 'organizer', 'Organizer Business', true, NULL, NULL, 30,
   '{"maxTournamentsPerMonth":null,"maxGames":null,"maxTemplates":null,"advancedAnalytics":true,"prioritySupport":true,"allowSameNameClub":true,"dashboardCarousel":true}', false, 3, CURRENT_TIMESTAMP),
  ('club_basic', 'club', 'Club Basic', true, NULL, NULL, 30,
   '{"maxEntriesPerGame":3,"maxGames":5,"maxPlayersPerTeam":6,"maxSubstitutesPerTeam":1,"canSetCoach":true,"merchStore":false,"enhancedProfile":false,"dashboardCarousel":false}', false, 1, CURRENT_TIMESTAMP),
  ('club_business', 'club', 'Club Business', true, NULL, NULL, 30,
   '{"maxEntriesPerGame":null,"maxGames":null,"maxPlayersPerTeam":6,"maxSubstitutesPerTeam":2,"canSetCoach":true,"merchStore":true,"enhancedProfile":true,"dashboardCarousel":true}', false, 3, CURRENT_TIMESTAMP),
  ('player_basic', 'player', 'Player Basic', true, NULL, NULL, 30,
   '{"priorityRegistration":false,"extendedStats":true}', false, 1, CURRENT_TIMESTAMP),
  ('player_business', 'player', 'Player Business', true, NULL, NULL, 30,
   '{"priorityRegistration":true,"extendedStats":true}', false, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Challenge limits for every tier. Keys: maxChallengesPerMonth (null =
-- unlimited), maxChallengePrizeUsd (null = unlimited), canJoinChallenges.
-- "limits || ..." merges into whatever the plan already has.
UPDATE "Plan" SET "limits" = "limits" || '{"maxChallengesPerMonth":1,"maxChallengePrizeUsd":10,"canJoinChallenges":false}'::jsonb
  WHERE "code" IN ('organizer_free', 'club_free', 'player_free');
UPDATE "Plan" SET "limits" = "limits" || '{"maxChallengesPerMonth":10,"maxChallengePrizeUsd":100,"canJoinChallenges":true}'::jsonb
  WHERE "code" IN ('organizer_basic', 'club_basic', 'player_basic');
UPDATE "Plan" SET "limits" = "limits" || '{"maxChallengesPerMonth":30,"maxChallengePrizeUsd":1000,"canJoinChallenges":true}'::jsonb
  WHERE "code" IN ('organizer_pro', 'club_pro', 'player_plus');
UPDATE "Plan" SET "limits" = "limits" || '{"maxChallengesPerMonth":null,"maxChallengePrizeUsd":null,"canJoinChallenges":true}'::jsonb
  WHERE "code" IN ('organizer_business', 'club_business', 'player_business');

-- The existing Pro-level plans sit between Basic and Business.
UPDATE "Plan" SET "sortOrder" = 2 WHERE "code" IN ('organizer_pro', 'club_pro', 'player_plus');
