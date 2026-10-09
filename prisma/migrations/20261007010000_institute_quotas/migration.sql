-- Per-institute entry quotas, a per-entry institute snapshot (teams play for ONE
-- institute), and who approved an entry.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "maxEntriesPerInstitute" INTEGER;

-- AlterTable
ALTER TABLE "TournamentInstitution" ADD COLUMN "maxEntries" INTEGER;

-- AlterTable
ALTER TABLE "Registration"
    ADD COLUMN "institutionId" TEXT,
    ADD COLUMN "approvedByInstitutionId" TEXT;

-- CreateIndex
CREATE INDEX "Registration_tournamentId_institutionId_idx" ON "Registration"("tournamentId", "institutionId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: entries already in institution-only tournaments play for their
-- players' institute (routed ones first, then solo, then single-institute teams).
UPDATE "Registration" SET "institutionId" = "routedInstitutionId"
WHERE "routedInstitutionId" IS NOT NULL AND "institutionId" IS NULL;

UPDATE "Registration" r SET "institutionId" = pi."institutionId"
FROM "PlayerInstitution" pi, "Tournament" t
WHERE r."institutionId" IS NULL AND r."playerId" = pi."playerId" AND pi."institutionId" IS NOT NULL
  AND t."id" = r."tournamentId" AND t."audienceScope" = 'institution';

UPDATE "Registration" r SET "institutionId" = x."institutionId"
FROM (
  SELECT tm."teamEntryId", MIN(pi."institutionId") AS "institutionId"
  FROM "TeamMember" tm
  JOIN "PlayerInstitution" pi ON pi."playerId" = tm."playerId"
  GROUP BY tm."teamEntryId"
  HAVING COUNT(*) = COUNT(pi."institutionId") AND COUNT(DISTINCT pi."institutionId") = 1
) x, "Tournament" t
WHERE r."institutionId" IS NULL AND r."teamEntryId" = x."teamEntryId"
  AND t."id" = r."tournamentId" AND t."audienceScope" = 'institution';
