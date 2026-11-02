-- One on/off switch per way to pay (manual payments, NOWPayments, later Safepay).
CREATE TABLE "PaymentChannel" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentChannel_pkey" PRIMARY KEY ("key")
);

-- Manual payments stay on. NOWPayments keeps whatever the old single gateway switch was set to.
INSERT INTO "PaymentChannel" ("key", "enabled", "updatedAt") VALUES ('manual', true, CURRENT_TIMESTAMP);
INSERT INTO "PaymentChannel" ("key", "enabled", "updatedAt")
SELECT 'nowpayments', COALESCE((SELECT "paymentGatewayEnabled" FROM "SiteSettings" WHERE "id" = 'singleton'), false), CURRENT_TIMESTAMP;
