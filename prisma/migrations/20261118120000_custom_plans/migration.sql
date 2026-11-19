-- Separate monthly limits for tournaments, leagues and scrims (they used to share one number),
-- private plans for custom quotes, and the "Customize your plan" requests.

-- Every organizer plan keeps its current monthly number for all three event types, so nothing
-- changes for anyone until an admin edits the plans.
UPDATE "Plan"
SET "limits" = "limits" || jsonb_build_object(
      'maxLeaguesPerMonth', "limits"->'maxTournamentsPerMonth',
      'maxScrimsPerMonth', "limits"->'maxTournamentsPerMonth')
WHERE "audience" = 'organizer' AND NOT ("limits" ? 'maxLeaguesPerMonth');

ALTER TABLE "Plan" ADD COLUMN "privateForUserId" TEXT;
CREATE INDEX "Plan_privateForUserId_idx" ON "Plan"("privateForUserId");

CREATE TYPE "CustomPlanRequestStatus" AS ENUM ('open', 'quoted', 'closed');

CREATE TABLE "CustomPlanRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "limits" JSONB NOT NULL,
    "note" TEXT,
    "status" "CustomPlanRequestStatus" NOT NULL DEFAULT 'open',
    "quotedPlanCode" TEXT,
    "adminNote" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPlanRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomPlanRequest_status_createdAt_idx" ON "CustomPlanRequest"("status", "createdAt");
CREATE INDEX "CustomPlanRequest_userId_idx" ON "CustomPlanRequest"("userId");
