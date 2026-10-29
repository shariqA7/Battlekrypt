-- Invoices against organizations, admin-managed payment methods, and the settings they use.

CREATE TYPE "PaymentMethodType" AS ENUM ('bank', 'wallet', 'crypto', 'other');
CREATE TYPE "InvoiceStatus" AS ENUM ('unpaid', 'proof_submitted', 'paid', 'cancelled');
CREATE TYPE "InvoiceSource" AS ENUM ('admin_added', 'application_approved', 'admin_manual');
CREATE TYPE "InvoiceLineKind" AS ENUM ('plan', 'security_deposit', 'other');

ALTER TABLE "SiteSettings"
    ADD COLUMN "paymentGatewayEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "invoiceTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN "invoiceTaxLabel" TEXT NOT NULL DEFAULT 'Tax';

CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "name" TEXT NOT NULL,
    "currencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bankName" TEXT,
    "accountTitle" TEXT,
    "accountNumber" TEXT,
    "iban" TEXT,
    "branch" TEXT,
    "swiftCode" TEXT,
    "walletNumber" TEXT,
    "cryptoAsset" TEXT,
    "cryptoNetwork" TEXT,
    "cryptoAddress" TEXT,
    "cryptoMemo" TEXT,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentMethod_isActive_sortOrder_idx" ON "PaymentMethod"("isActive", "sortOrder");

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'unpaid',
    "source" "InvoiceSource" NOT NULL DEFAULT 'admin_manual',
    "currency" TEXT NOT NULL,
    "planCode" TEXT,
    "planName" TEXT,
    "planPeriodDays" INTEGER,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gatewayFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "proofUrl" TEXT,
    "proofSubmittedAt" TIMESTAMP(3),
    "proofMethodId" TEXT,
    "proofReference" TEXT,
    "proofRejectedNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(14,2),
    "paidMethodId" TEXT,
    "paidMethodName" TEXT,
    "paidReference" TEXT,
    "paidById" TEXT,
    "paidNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_organizerId_status_idx" ON "Invoice"("organizerId", "status");
CREATE INDEX "Invoice_status_issuedAt_idx" ON "Invoice"("status", "issuedAt");
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidMethodId_fkey" FOREIGN KEY ("paidMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);
