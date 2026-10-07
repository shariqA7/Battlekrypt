-- Challenges part 4: reports and moderation, collusion flags, terms acceptance.
--
-- Safe to run more than once, and on a database where an earlier attempt got
-- part-way (every create is "if not exists").

-- A challenge an admin took down after reports
ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'removed';

DO $$ BEGIN
  CREATE TYPE "ChallengeReportReason" AS ENUM ('scam', 'inappropriate', 'misleading', 'spam', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeReportStatus" AS ENUM ('open', 'actioned', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeFlagKind" AS ENUM ('same_device', 'same_network', 'repeat_pair');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeFlagStatus" AS ENUM ('open', 'dismissed', 'actioned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ChallengeReport" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "ChallengeReportReason" NOT NULL,
    "details" TEXT,
    "status" "ChallengeReportStatus" NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChallengeFlag" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "posterUserId" TEXT NOT NULL,
    "challengerUserId" TEXT NOT NULL,
    "kind" "ChallengeFlagKind" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ChallengeFlagStatus" NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChallengeReport_challengeId_reporterId_key" ON "ChallengeReport"("challengeId", "reporterId");
CREATE INDEX IF NOT EXISTS "ChallengeReport_status_createdAt_idx" ON "ChallengeReport"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ChallengeFlag_applicationId_kind_key" ON "ChallengeFlag"("applicationId", "kind");
CREATE INDEX IF NOT EXISTS "ChallengeFlag_status_createdAt_idx" ON "ChallengeFlag"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ChallengeReport" ADD CONSTRAINT "ChallengeReport_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ChallengeReport" ADD CONSTRAINT "ChallengeReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
