-- Duplicate-screenshot detection: one fingerprint row per submitted payment proof.
CREATE TYPE "ProofKind" AS ENUM ('registration', 'plan_request', 'invoice', 'club_fee');

CREATE TABLE "ProofFingerprint" (
    "id" TEXT NOT NULL,
    "kind" "ProofKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "userId" TEXT,
    "organizerId" TEXT,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofFingerprint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProofFingerprint_kind_refId_key" ON "ProofFingerprint"("kind", "refId");
CREATE INDEX "ProofFingerprint_sha256_idx" ON "ProofFingerprint"("sha256");
