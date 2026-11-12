-- Site feedback: feature ideas and problem reports from visitors and signed-in users.
CREATE TYPE "FeedbackKind" AS ENUM ('feature', 'issue', 'other');
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'reviewing', 'planned', 'done', 'declined');

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "userId" TEXT,
    "contactEmail" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
