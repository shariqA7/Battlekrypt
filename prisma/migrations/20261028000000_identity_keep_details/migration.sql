-- Identity checks now keep the verified name, number (encrypted) and address.
ALTER TABLE "IdentityVerification" ADD COLUMN "detailsEnc" TEXT;

-- idRetentionDays is now the MAXIMUM time photos are kept after an approval.
ALTER TABLE "OrganizerTrustConfig" ALTER COLUMN "idRetentionDays" SET DEFAULT 365;
UPDATE "OrganizerTrustConfig" SET "idRetentionDays" = 365 WHERE "idRetentionDays" = 30;
