-- Plan changes: upgrades bill a credit for unused time; downgrades take effect when the period ends.
ALTER TYPE "InvoiceSource" ADD VALUE 'plan_change';

ALTER TABLE "OrganizerProfile"
    ADD COLUMN "pendingPlanCode" TEXT,
    ADD COLUMN "nextPlanCode" TEXT,
    ADD COLUMN "nextPlanStartsAt" TIMESTAMP(3),
    ADD COLUMN "nextPlanDays" INTEGER;
