-- Details an admin enters when adding an organization or institute directly.
ALTER TABLE "OrganizerProfile"
    ADD COLUMN "orgType" TEXT,
    ADD COLUMN "registrationNumber" TEXT,
    ADD COLUMN "website" TEXT,
    ADD COLUMN "city" TEXT,
    ADD COLUMN "address" TEXT,
    ADD COLUMN "contactEmail" TEXT,
    ADD COLUMN "contactPhone" TEXT,
    ADD COLUMN "createdByAdminId" TEXT;

ALTER TABLE "Institution"
    ADD COLUMN "kind" TEXT,
    ADD COLUMN "proofPath" TEXT;
