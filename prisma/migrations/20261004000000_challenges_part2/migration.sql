-- Challenges part 2: applications, picking challengers, in-app notifications.
--
-- Safe to run more than once, and on a database where an earlier attempt got
-- part-way (every create is "if not exists").

-- Enums
DO $$ BEGIN
  CREATE TYPE "ChallengeApplicationStatus" AS ENUM ('applied', 'selected', 'not_selected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ChallengeEntrantKind" AS ENUM ('player', 'team');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Challenge: when the poster confirmed their pick, and the deadline that started
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "selectedAt" TIMESTAMP(3);
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "completeBy" TIMESTAMP(3);

-- Applications
CREATE TABLE IF NOT EXISTS "ChallengeApplication" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "kind" "ChallengeEntrantKind" NOT NULL,
    "clubTeamId" TEXT,
    "entrantName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "message" TEXT,
    "status" "ChallengeApplicationStatus" NOT NULL DEFAULT 'applied',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeApplication_pkey" PRIMARY KEY ("id")
);

-- Notifications
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "ChallengeApplication_challengeId_applicantUserId_key" ON "ChallengeApplication"("challengeId", "applicantUserId");
CREATE INDEX IF NOT EXISTS "ChallengeApplication_challengeId_status_idx" ON "ChallengeApplication"("challengeId", "status");
CREATE INDEX IF NOT EXISTS "ChallengeApplication_applicantUserId_idx" ON "ChallengeApplication"("applicantUserId");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ChallengeApplication" ADD CONSTRAINT "ChallengeApplication_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ChallengeApplication" ADD CONSTRAINT "ChallengeApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ChallengeApplication" ADD CONSTRAINT "ChallengeApplication_clubTeamId_fkey" FOREIGN KEY ("clubTeamId") REFERENCES "ClubTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
