-- Transaction ID typed by the payer on every payment proof, and matched for duplicates.
ALTER TABLE "Registration" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "PlanRequest" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "ClubProfile" ADD COLUMN "feeReference" TEXT;

-- A proof can now be fingerprinted by its typed ID even when the screenshot file can't be fetched.
ALTER TABLE "ProofFingerprint" ALTER COLUMN "sha256" DROP NOT NULL;
ALTER TABLE "ProofFingerprint" ADD COLUMN "reference" TEXT;
CREATE INDEX "ProofFingerprint_reference_idx" ON "ProofFingerprint"("reference");
