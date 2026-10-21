-- Currencies for East and Southeast Asia, switched on for organizers.
-- CNY, JPY, KRW and TWD are new; THB and VND already have a row (switched off) and are switched on.
-- Safe to run again: an existing row only has its "enabled" flag set.
INSERT INTO "CurrencySetting" ("code", "enabled", "sortOrder", "updatedAt") VALUES
  ('CNY', true, 26, CURRENT_TIMESTAMP),
  ('JPY', true, 27, CURRENT_TIMESTAMP),
  ('KRW', true, 28, CURRENT_TIMESTAMP),
  ('TWD', true, 29, CURRENT_TIMESTAMP),
  ('THB', true, 17, CURRENT_TIMESTAMP),
  ('VND', true, 18, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;
