ALTER TABLE "SiteSettings" ADD COLUMN "playerReportsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizerTrustConfig" ADD COLUMN "reportPauseThreshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "OrganizerProfile"
    ADD COLUMN "reportsPausedAt" TIMESTAMP(3),
    ADD COLUMN "reportsPauseReason" TEXT;

CREATE TYPE "ReportKind" AS ENUM ('rejected_after_paying', 'not_delivered', 'refund_not_received', 'misleading', 'other');
CREATE TYPE "ReportStatus" AS ENUM ('open', 'upheld', 'dismissed');

CREATE TABLE "OrganizerReport" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizerReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizerReport_organizerId_status_idx" ON "OrganizerReport"("organizerId", "status");
CREATE INDEX "OrganizerReport_reporterUserId_createdAt_idx" ON "OrganizerReport"("reporterUserId", "createdAt");
CREATE INDEX "OrganizerReport_tournamentId_idx" ON "OrganizerReport"("tournamentId");
ALTER TABLE "OrganizerReport" ADD CONSTRAINT "OrganizerReport_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizerReport" ADD CONSTRAINT "OrganizerReport_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
