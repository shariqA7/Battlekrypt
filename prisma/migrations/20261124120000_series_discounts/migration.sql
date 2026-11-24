-- Booking discounts for scrim series, and the amount actually paid per session.
ALTER TABLE "ScrimSeries" ADD COLUMN "discountTiers" JSONB;
ALTER TABLE "SeriesBooking" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "totalAmount" DECIMAL(14,2);
ALTER TABLE "Registration" ADD COLUMN "paidAmount" DECIMAL(14,2);
-- Existing bookings were charged the list price.
UPDATE "SeriesBooking" SET "totalAmount" = "feePerSession" * "sessionCount" WHERE "feePerSession" IS NOT NULL;
