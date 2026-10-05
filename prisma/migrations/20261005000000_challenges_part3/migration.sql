-- Challenges part 3: proof of winning, payment, disputes.
--
-- Safe to run more than once, and on a database where an earlier attempt got
-- part-way (every create is "if not exists").

-- Enums
DO $$ BEGIN
  CREATE TYPE "ChallengeStage" AS ENUM ('playing', 'proof_review', 'proof_disputed', 'awaiting_payout_details', 'awaiting_payment', 'payment_sent', 'payment_disputed', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeDisputeKind" AS ENUM ('proof', 'payment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeDisputeStatus" AS ENUM ('awaiting_response', 'awaiting_admin', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeDisputeOutcome" AS ENUM ('for_challenger', 'for_poster');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Entry progress columns
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "stage" "ChallengeStage" NOT NULL DEFAULT 'playing';
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "stageDeadline" TIMESTAMP(3);
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "matchId" TEXT;
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "proofUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "proofNote" TEXT;
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "proofSubmittedAt" TIMESTAMP(3);
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "payoutDetails" TEXT;
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "paymentReceiptUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "paymentNote" TEXT;
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "paymentSentAt" TIMESTAMP(3);
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "paymentOwed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "ChallengeApplication" ADD COLUMN IF NOT EXISTS "failedReason" TEXT;

-- Entries picked before this update: their deadline is the challenge's.
UPDATE "ChallengeApplication" a SET "stageDeadline" = c."completeBy"
  FROM "Challenge" c
  WHERE a."challengeId" = c."id" AND a."status" = 'selected' AND a."stage" = 'playing' AND a."stageDeadline" IS NULL;

-- Disputes
CREATE TABLE IF NOT EXISTS "ChallengeDispute" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "kind" "ChallengeDisputeKind" NOT NULL,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "openerEvidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responderNote" TEXT,
    "responderEvidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "respondedAt" TIMESTAMP(3),
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "status" "ChallengeDisputeStatus" NOT NULL DEFAULT 'awaiting_response',
    "missedDeadline" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "ChallengeDisputeOutcome",
    "adminNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChallengeDispute_status_createdAt_idx" ON "ChallengeDispute"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ChallengeDispute_applicationId_idx" ON "ChallengeDispute"("applicationId");
CREATE INDEX IF NOT EXISTS "ChallengeDispute_challengeId_idx" ON "ChallengeDispute"("challengeId");

DO $$ BEGIN
  ALTER TABLE "ChallengeDispute" ADD CONSTRAINT "ChallengeDispute_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ChallengeApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
