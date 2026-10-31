-- Tax paid to the authority: tax collected from customers and handed over, and income tax on profit.
CREATE TYPE "TaxPaymentType" AS ENUM ('collected_tax', 'income_tax');

CREATE TABLE "TaxPayment" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "TaxPaymentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "authority" TEXT,
    "reference" TEXT,
    "periodNote" TEXT,
    "note" TEXT,
    "receiptUrl" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidNote" TEXT,
    "voidedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaxPayment_date_idx" ON "TaxPayment"("date");
CREATE INDEX "TaxPayment_type_date_idx" ON "TaxPayment"("type", "date");
