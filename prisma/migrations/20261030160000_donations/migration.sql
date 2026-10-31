ALTER TYPE "PaymentKind" ADD VALUE 'donation';
ALTER TYPE "ProofKind" ADD VALUE 'donation';

ALTER TABLE "SiteSettings"
    ADD COLUMN "donationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "donationsVerifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "donationInstructions" TEXT;

CREATE TYPE "DonationStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "DonationCampaignStatus" AS ENUM ('draft', 'active', 'closed');

CREATE TABLE "DonationCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goalAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "DonationCampaignStatus" NOT NULL DEFAULT 'active',
    "verifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DonationCampaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DonationCampaign_slug_key" ON "DonationCampaign"("slug");
CREATE INDEX "DonationCampaign_status_createdAt_idx" ON "DonationCampaign"("status", "createdAt");

CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "reference" TEXT,
    "message" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "DonationStatus" NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Donation_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "Donation_status_createdAt_idx" ON "Donation"("status", "createdAt");
CREATE INDEX "Donation_userId_createdAt_idx" ON "Donation"("userId", "createdAt");
CREATE INDEX "Donation_campaignId_status_idx" ON "Donation"("campaignId", "status");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FundAllocation" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "campaignId" TEXT,
    "tournamentId" TEXT,
    "allocatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FundAllocation_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "FundAllocation_createdAt_idx" ON "FundAllocation"("createdAt");
CREATE INDEX "FundAllocation_campaignId_idx" ON "FundAllocation"("campaignId");
CREATE INDEX "FundAllocation_tournamentId_idx" ON "FundAllocation"("tournamentId");
ALTER TABLE "FundAllocation" ADD CONSTRAINT "FundAllocation_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FundAllocation" ADD CONSTRAINT "FundAllocation_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
