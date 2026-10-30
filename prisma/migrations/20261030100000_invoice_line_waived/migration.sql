-- Waive the plan fee and the security fee separately: a waived line keeps its original figure in unitAmount.
ALTER TABLE "InvoiceLine" ADD COLUMN "waived" BOOLEAN NOT NULL DEFAULT false;
