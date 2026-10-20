-- Penalties: a team caught cheating is disqualified, and the organizer decides
-- what happens to a no-show. Host organizers and co-host institutes (for their
-- own entries) can act; every consequence is logged.

-- CreateEnum
CREATE TYPE "PenaltyKind" AS ENUM ('warning', 'point_deduction', 'disqualification');
CREATE TYPE "PenaltyCause" AS ENUM ('cheating', 'no_show', 'other');
CREATE TYPE "NoShowPenalty" AS ENUM ('none', 'warning', 'point_deduction', 'disqualification');

-- AlterTable
ALTER TABLE "Tournament"
    ADD COLUMN "noShowPenalty" "NoShowPenalty" NOT NULL DEFAULT 'none',
    ADD COLUMN "noShowPenaltyPoints" INTEGER;

-- AlterTable
ALTER TABLE "Registration"
    ADD COLUMN "disqualifiedAt" TIMESTAMP(3),
    ADD COLUMN "disqualifiedByUserId" TEXT,
    ADD COLUMN "disqualifiedByInstitutionId" TEXT;

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" "PenaltyKind" NOT NULL,
    "points" INTEGER,
    "cause" "PenaltyCause" NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "issuedByInstitutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Penalty_registrationId_idx" ON "Penalty"("registrationId");
CREATE INDEX "Penalty_tournamentId_createdAt_idx" ON "Penalty"("tournamentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_issuedByInstitutionId_fkey" FOREIGN KEY ("issuedByInstitutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Entries disqualified BEFORE this change keep their reason; give them a log row
-- so the history is in one place. The date and the person are unknown.
INSERT INTO "Penalty" ("id", "registrationId", "tournamentId", "kind", "cause", "reason", "issuedByUserId", "createdAt")
SELECT gen_random_uuid()::text, r."id", r."tournamentId", 'disqualification', 'other',
       COALESCE(r."disqualifiedReason", 'Disqualified'),
       o."userId", CURRENT_TIMESTAMP
FROM "Registration" r
JOIN "Tournament" t ON t."id" = r."tournamentId"
JOIN "OrganizerProfile" o ON o."id" = t."organizerId"
WHERE r."status" = 'disqualified';
