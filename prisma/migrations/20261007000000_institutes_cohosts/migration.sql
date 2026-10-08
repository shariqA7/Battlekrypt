-- Institutes + co-hosts: the institute (not the admin) approves players per
-- tournament. Admin only verifies the institute itself.

-- CreateEnum
CREATE TYPE "CoHostRole" AS ENUM ('cohost', 'guest');

-- CreateEnum
CREATE TYPE "CoHostStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentInstitution" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "role" "CoHostRole" NOT NULL,
    "status" "CoHostStatus" NOT NULL DEFAULT 'pending',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "TournamentInstitution_pkey" PRIMARY KEY ("id")
);

-- AlterTable: legacy 8.1 membership rows become institute memberships.
ALTER TABLE "PlayerInstitution"
    ADD COLUMN "institutionId" TEXT,
    ADD COLUMN "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "idImagePath" DROP NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'approved';

-- AlterTable
ALTER TABLE "Registration"
    ADD COLUMN "routedInstitutionId" TEXT,
    ADD COLUMN "institutionApprovedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "Institution"("name");
CREATE UNIQUE INDEX "Institution_organizerId_key" ON "Institution"("organizerId");
CREATE INDEX "Institution_verified_idx" ON "Institution"("verified");
CREATE UNIQUE INDEX "TournamentInstitution_tournamentId_institutionId_key" ON "TournamentInstitution"("tournamentId", "institutionId");
CREATE INDEX "TournamentInstitution_institutionId_status_idx" ON "TournamentInstitution"("institutionId", "status");
CREATE INDEX "PlayerInstitution_institutionId_idx" ON "PlayerInstitution"("institutionId");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentInstitution" ADD CONSTRAINT "TournamentInstitution_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentInstitution" ADD CONSTRAINT "TournamentInstitution_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInstitution" ADD CONSTRAINT "PlayerInstitution_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_routedInstitutionId_fkey" FOREIGN KEY ("routedInstitutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy memberships keep their free-text name but have no institute yet: the
-- player must pick one again. Pending/rejected 8.1 reviews no longer exist as
-- a concept, so normalise them to the new "member" state.
UPDATE "PlayerInstitution" SET "status" = 'approved';
