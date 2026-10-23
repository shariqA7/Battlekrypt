-- Plans: refundable deposit + admin-defined display fields
ALTER TABLE "Plan" ADD COLUMN "depositAmount" DECIMAL(14,2);
ALTER TABLE "Plan" ADD COLUMN "extras" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "PlanRequest" ADD COLUMN "depositAmount" DECIMAL(14,2);

ALTER TABLE "SiteSettings"
    ADD COLUMN "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "depositRefundDays" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "depositExposureMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 5;

CREATE TABLE "PlanField" (
    "id" TEXT NOT NULL,
    "audience" "PlanAudience" NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanField_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlanField_audience_sortOrder_idx" ON "PlanField"("audience", "sortOrder");

CREATE TYPE "DepositStatus" AS ENUM ('held', 'refund_requested', 'refunded', 'forfeited');

CREATE TABLE "SecurityDeposit" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "planRequestId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'held',
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundRequestedAt" TIMESTAMP(3),
    "refundEligibleAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "refundedAmount" DECIMAL(14,2),
    "forfeitedAmount" DECIMAL(14,2),
    "adminNote" TEXT,
    CONSTRAINT "SecurityDeposit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecurityDeposit_planRequestId_key" ON "SecurityDeposit"("planRequestId");
CREATE INDEX "SecurityDeposit_organizerId_status_idx" ON "SecurityDeposit"("organizerId", "status");
CREATE INDEX "SecurityDeposit_status_refundEligibleAt_idx" ON "SecurityDeposit"("status", "refundEligibleAt");
ALTER TABLE "SecurityDeposit" ADD CONSTRAINT "SecurityDeposit_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
