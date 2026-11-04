-- Online payment gateway (NOWPayments): one row per checkout, plus every notification received.
CREATE TABLE "GatewayPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerInvoiceId" TEXT,
    "providerPaymentId" TEXT,
    "checkoutUrl" TEXT,
    "priceAmount" DECIMAL(14,2) NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "payCurrency" TEXT,
    "payAmount" DECIMAL(28,12),
    "actuallyPaid" DECIMAL(28,12),
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GatewayPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GatewayPayment_invoiceId_idx" ON "GatewayPayment"("invoiceId");
CREATE INDEX "GatewayPayment_providerPaymentId_idx" ON "GatewayPayment"("providerPaymentId");
CREATE INDEX "GatewayPayment_needsReview_idx" ON "GatewayPayment"("needsReview");
ALTER TABLE "GatewayPayment" ADD CONSTRAINT "GatewayPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GatewayEvent" (
    "id" TEXT NOT NULL,
    "gatewayPaymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GatewayEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GatewayEvent_gatewayPaymentId_createdAt_idx" ON "GatewayEvent"("gatewayPaymentId", "createdAt");
ALTER TABLE "GatewayEvent" ADD CONSTRAINT "GatewayEvent_gatewayPaymentId_fkey" FOREIGN KEY ("gatewayPaymentId") REFERENCES "GatewayPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
