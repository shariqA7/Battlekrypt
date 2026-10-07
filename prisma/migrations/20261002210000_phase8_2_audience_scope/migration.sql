-- Phase 8.2: audience scope on tournaments (spec §8).
CREATE TYPE "AudienceScope" AS ENUM ('open', 'institution');

ALTER TABLE "Tournament"
  ADD COLUMN "audienceScope" "AudienceScope" NOT NULL DEFAULT 'open',
  ADD COLUMN "requireFreshInstitutionProof" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TournamentTemplate"
  ADD COLUMN "audienceScope" "AudienceScope" NOT NULL DEFAULT 'open',
  ADD COLUMN "requireFreshInstitutionProof" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Registration" ADD COLUMN "institutionProofPath" TEXT;

CREATE INDEX "Tournament_audienceScope_idx" ON "Tournament"("audienceScope");
