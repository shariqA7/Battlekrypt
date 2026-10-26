ALTER TABLE "SiteSettings"
    ADD COLUMN "organizerTrustEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "tournamentLockEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "prizeBreakdownRequired" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "specialAwardsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "entryConditionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "challengesEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "guardianConsentEnabled" BOOLEAN;

ALTER TABLE "Tournament" ADD COLUMN "lockEnforced" BOOLEAN NOT NULL DEFAULT false;

-- Events that are already locked today (paid or prized, with an active
-- registration) stay locked even if an admin later switches the lock off.
UPDATE "Tournament" t SET "lockEnforced" = true
WHERE (t."entryType" = 'paid' OR (t."prizePoolAmount" IS NOT NULL AND t."prizePoolAmount" > 0))
  AND EXISTS (SELECT 1 FROM "Registration" r WHERE r."tournamentId" = t."id" AND r."status" IN ('pending', 'approved'));
