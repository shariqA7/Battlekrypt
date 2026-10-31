-- Issuer details shown on printable invoices and in invoice emails.
ALTER TABLE "SiteSettings"
    ADD COLUMN "invoiceIssuerName" TEXT NOT NULL DEFAULT 'BattleKrypt',
    ADD COLUMN "invoiceIssuerDetails" TEXT,
    ADD COLUMN "invoiceFooterNote" TEXT;
