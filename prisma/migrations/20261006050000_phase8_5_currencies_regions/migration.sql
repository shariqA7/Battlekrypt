-- Phase 8.5: admin-managed currency list + tournament country (region filter).
CREATE TABLE "CurrencySetting" (
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencySetting_pkey" PRIMARY KEY ("code")
);

-- The five launch currencies stay on; the rest of the catalog is added switched
-- off, so nothing changes for organizers until an admin enables more.
INSERT INTO "CurrencySetting" ("code", "enabled", "sortOrder", "updatedAt") VALUES
  ('PKR', true, 0, CURRENT_TIMESTAMP),
  ('USD', true, 1, CURRENT_TIMESTAMP),
  ('INR', true, 2, CURRENT_TIMESTAMP),
  ('SAR', true, 3, CURRENT_TIMESTAMP),
  ('AED', true, 4, CURRENT_TIMESTAMP),
  ('BDT', false, 5, CURRENT_TIMESTAMP),
  ('LKR', false, 6, CURRENT_TIMESTAMP),
  ('NPR', false, 7, CURRENT_TIMESTAMP),
  ('QAR', false, 8, CURRENT_TIMESTAMP),
  ('KWD', false, 9, CURRENT_TIMESTAMP),
  ('BHD', false, 10, CURRENT_TIMESTAMP),
  ('OMR', false, 11, CURRENT_TIMESTAMP),
  ('EGP', false, 12, CURRENT_TIMESTAMP),
  ('TRY', false, 13, CURRENT_TIMESTAMP),
  ('MYR', false, 14, CURRENT_TIMESTAMP),
  ('IDR', false, 15, CURRENT_TIMESTAMP),
  ('PHP', false, 16, CURRENT_TIMESTAMP),
  ('THB', false, 17, CURRENT_TIMESTAMP),
  ('VND', false, 18, CURRENT_TIMESTAMP),
  ('SGD', false, 19, CURRENT_TIMESTAMP),
  ('EUR', false, 20, CURRENT_TIMESTAMP),
  ('GBP', false, 21, CURRENT_TIMESTAMP),
  ('CAD', false, 22, CURRENT_TIMESTAMP),
  ('AUD', false, 23, CURRENT_TIMESTAMP),
  ('ZAR', false, 24, CURRENT_TIMESTAMP),
  ('NGN', false, 25, CURRENT_TIMESTAMP);

ALTER TABLE "Tournament" ADD COLUMN "country" TEXT;
CREATE INDEX "Tournament_country_idx" ON "Tournament"("country");

-- Best-effort backfill from the organizer's free-text country, only for the
-- unambiguous launch markets. Anything else stays NULL (= worldwide).
UPDATE "Tournament" t
SET "country" = CASE lower(trim(o."country"))
    WHEN 'pakistan' THEN 'PK' WHEN 'pk' THEN 'PK'
    WHEN 'india' THEN 'IN' WHEN 'in' THEN 'IN'
    WHEN 'saudi arabia' THEN 'SA' WHEN 'sa' THEN 'SA'
    WHEN 'united arab emirates' THEN 'AE' WHEN 'uae' THEN 'AE' WHEN 'ae' THEN 'AE'
  END
FROM "OrganizerProfile" o
WHERE o."id" = t."organizerId" AND o."country" IS NOT NULL;
