-- Recurring scrim series: one setup, many generated scrim events.
CREATE TYPE "ScrimSeriesStatus" AS ENUM ('active', 'paused', 'ended');

CREATE TABLE "ScrimSeries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "mode" "TournamentMode" NOT NULL,
    "maxTeamSize" INTEGER NOT NULL,
    "maxTeams" INTEGER NOT NULL,
    "playersPerRoom" INTEGER,
    "entryType" "EntryType" NOT NULL,
    "entryFeeAmount" DECIMAL(14,2),
    "entryFeeCurrency" TEXT,
    "paymentInstructions" TEXT,
    "rulesText" TEXT,
    "country" TEXT,
    "timezone" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "slotTimes" TEXT[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "skipDates" TEXT[],
    "status" "ScrimSeriesStatus" NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrimSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrimSeries_slug_key" ON "ScrimSeries"("slug");
CREATE INDEX "ScrimSeries_organizerId_status_idx" ON "ScrimSeries"("organizerId", "status");
CREATE INDEX "ScrimSeries_status_idx" ON "ScrimSeries"("status");

ALTER TABLE "ScrimSeries" ADD CONSTRAINT "ScrimSeries_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrimSeries" ADD CONSTRAINT "ScrimSeries_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tournament" ADD COLUMN "seriesId" TEXT, ADD COLUMN "sessionNo" INTEGER;
CREATE UNIQUE INDEX "Tournament_seriesId_sessionNo_key" ON "Tournament"("seriesId", "sessionNo");
CREATE INDEX "Tournament_seriesId_startAt_idx" ON "Tournament"("seriesId", "startAt");
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ScrimSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plan limits for series. maxScrimSeries: series running at once. maxSeriesDays: the longest a
-- series may run (null = non-stop allowed). maxSlotsPerDay: sessions per day. Free plans: none.
UPDATE "Plan" SET "limits" = "limits" || '{"maxScrimSeries":0,"maxSeriesDays":0,"maxSlotsPerDay":0}'::jsonb WHERE "code" = 'organizer_free';
UPDATE "Plan" SET "limits" = "limits" || '{"maxScrimSeries":1,"maxSeriesDays":31,"maxSlotsPerDay":2}'::jsonb WHERE "code" = 'organizer_basic';
UPDATE "Plan" SET "limits" = "limits" || '{"maxScrimSeries":3,"maxSeriesDays":93,"maxSlotsPerDay":4}'::jsonb WHERE "code" = 'organizer_pro';
UPDATE "Plan" SET "limits" = "limits" || '{"maxScrimSeries":null,"maxSeriesDays":null,"maxSlotsPerDay":null}'::jsonb WHERE "code" = 'organizer_business';
