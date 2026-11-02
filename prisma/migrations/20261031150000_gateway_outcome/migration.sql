-- Keep what the gateway says we will receive after its fees, to flag payments that come up short.
ALTER TABLE "GatewayPayment"
    ADD COLUMN "outcomeAmount" DECIMAL(28,12),
    ADD COLUMN "outcomeCurrency" TEXT;
