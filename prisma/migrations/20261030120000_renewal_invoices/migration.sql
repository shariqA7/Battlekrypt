-- Automatic renewal invoices.
ALTER TYPE "InvoiceSource" ADD VALUE 'renewal';

ALTER TABLE "OrganizerProfile" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invoice" ADD COLUMN "renewalForExpiry" TIMESTAMP(3);
CREATE INDEX "Invoice_organizerId_renewalForExpiry_idx" ON "Invoice"("organizerId", "renewalForExpiry");

ALTER TABLE "SiteSettings"
    ADD COLUMN "renewalInvoicesEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "renewalLeadDays" INTEGER NOT NULL DEFAULT 7;
