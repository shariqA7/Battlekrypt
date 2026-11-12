-- Sponsor ads (direct campaigns) and the optional Google AdSense fallback settings.
ALTER TABLE "SiteSettings"
  ADD COLUMN "adsenseClientId" TEXT,
  ADD COLUMN "adsenseSlotBrowse" TEXT,
  ADD COLUMN "adsenseSlotTournament" TEXT,
  ADD COLUMN "adsenseSlotDashboard" TEXT;

CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "advertiser" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "placements" TEXT[],
    "audience" TEXT NOT NULL DEFAULT 'all',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "paidAmount" DECIMAL(14,2),
    "paidCurrency" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdDailyStat" (
    "campaignId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdDailyStat_pkey" PRIMARY KEY ("campaignId","day")
);

CREATE INDEX "AdCampaign_active_startsAt_idx" ON "AdCampaign"("active", "startsAt");

ALTER TABLE "AdDailyStat" ADD CONSTRAINT "AdDailyStat_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
