-- Multi-session bookings for scrim series, and the carry-over / refund choice when a session is cancelled.
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "SessionChoice" AS ENUM ('pending', 'moved', 'refund');

CREATE TABLE "SeriesBooking" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubTeamId" TEXT,
    "paymentProofUrl" TEXT,
    "paymentReference" TEXT,
    "feePerSession" DECIMAL(14,2),
    "currency" TEXT,
    "sessionCount" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesBooking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeriesBooking_seriesId_status_idx" ON "SeriesBooking"("seriesId", "status");
CREATE INDEX "SeriesBooking_userId_idx" ON "SeriesBooking"("userId");
ALTER TABLE "SeriesBooking" ADD CONSTRAINT "SeriesBooking_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ScrimSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Registration"
  ADD COLUMN "bookingId" TEXT,
  ADD COLUMN "choiceStatus" "SessionChoice",
  ADD COLUMN "choiceDeadline" TIMESTAMP(3),
  ADD COLUMN "carriedFromId" TEXT;
CREATE INDEX "Registration_bookingId_idx" ON "Registration"("bookingId");
CREATE INDEX "Registration_choiceStatus_choiceDeadline_idx" ON "Registration"("choiceStatus", "choiceDeadline");
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "SeriesBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
