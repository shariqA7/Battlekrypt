-- Discounts (a negative invoice line) and waiving an invoice.
ALTER TYPE "InvoiceStatus" ADD VALUE 'waived';
ALTER TYPE "InvoiceLineKind" ADD VALUE 'discount';

ALTER TABLE "Invoice"
    ADD COLUMN "waivedAt" TIMESTAMP(3),
    ADD COLUMN "waivedNote" TEXT,
    ADD COLUMN "waivedById" TEXT;
