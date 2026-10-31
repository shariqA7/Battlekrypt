-- Phase 7.2: payment disputes and refund tracking.
CREATE TYPE "PaymentDisputeKind" AS ENUM ('rejected_after_paying', 'no_room_details', 'event_not_held', 'wrong_amount', 'fake_proof');
CREATE TYPE "PaymentDisputeStatus" AS ENUM ('awaiting_response', 'awaiting_admin', 'resolved');
CREATE TYPE "PaymentDisputeOutcome" AS ENUM ('for_payer', 'for_organizer');

ALTER TABLE "Registration" ADD COLUMN "payerUserId" TEXT;

CREATE TABLE "PaymentDispute" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "organizerUserId" TEXT NOT NULL,
    "kind" "PaymentDisputeKind" NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "openerEvidenceUrls" TEXT[],
    "responderNote" TEXT,
    "responderEvidenceUrls" TEXT[],
    "respondedAt" TIMESTAMP(3),
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "status" "PaymentDisputeStatus" NOT NULL DEFAULT 'awaiting_response',
    "missedDeadline" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "PaymentDisputeOutcome",
    "adminNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "refundAmount" DECIMAL(14,2),
    "refundCurrency" TEXT,
    "refundDueAt" TIMESTAMP(3),
    "refundSentAt" TIMESTAMP(3),
    "refundReceivedAt" TIMESTAMP(3),
    "refundContestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentDispute_status_createdAt_idx" ON "PaymentDispute"("status", "createdAt");
CREATE INDEX "PaymentDispute_registrationId_idx" ON "PaymentDispute"("registrationId");
CREATE INDEX "PaymentDispute_organizerId_status_idx" ON "PaymentDispute"("organizerId", "status");
CREATE INDEX "PaymentDispute_payerUserId_idx" ON "PaymentDispute"("payerUserId");

ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
