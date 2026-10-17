-- A player's student ID card is now stored once on their profile and reused by
-- every tournament that asks for one (instead of a fresh photo per tournament).

-- AlterTable
ALTER TABLE "PlayerInstitution"
    ADD COLUMN "idInstitutionId" TEXT,
    ADD COLUMN "idExpiresAt" DATE,
    ADD COLUMN "idUploadedAt" TIMESTAMP(3);

-- "idImagePath" used to hold the old admin-review photo (bucket "institution-ids").
-- It now means "the stored ID in the institution-proofs bucket", so any old
-- value must not be mistaken for one. Only the reference is cleared; no file is
-- deleted.
UPDATE "PlayerInstitution" SET "idImagePath" = NULL WHERE "idImagePath" IS NOT NULL;
