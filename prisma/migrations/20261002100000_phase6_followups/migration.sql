-- Default "world" settings per tier (spec §9). Previously only the dev seed
-- inserted these, so a production database without the seed had NO tier
-- settings — and with no setting a tier skips its prize-pool floor and entry
-- gate entirely. Inserted only when missing, so an admin's edits are kept.
INSERT INTO "CompetitiveTierSetting" ("id", "tier", "scope", "scopeValue", "minPrizePoolUsd", "minRating", "minWins", "publishPath", "updatedAt")
SELECT gen_random_uuid()::text, v.tier::"CompetitiveTier", 'world', NULL, v.pool, v.rating, v.wins, v.path::"TierPublishPath", CURRENT_TIMESTAMP
FROM (VALUES
  ('D',        20,    NULL::int,  NULL::int, 'instant'),
  ('C',        100,   NULL,       NULL,      'instant'),
  ('B',        300,   3000,       NULL,      'instant'),
  ('A',        900,   7000,       NULL,      'instant'),
  ('S',        1800,  10000,      NULL,      'admin_review'),
  ('National', 50000, NULL,       5,         'always_admin')
) AS v(tier, pool, rating, wins, path)
WHERE NOT EXISTS (
  SELECT 1 FROM "CompetitiveTierSetting" c
  WHERE c."tier" = v.tier::"CompetitiveTier" AND c."scope" = 'world'
);

-- Plan columns were added to OrganizationMember by mistake (plans belong to
-- the organization, OrganizerProfile). Nothing reads them.
ALTER TABLE "OrganizationMember" DROP COLUMN "planCode", DROP COLUMN "planExpiresAt";
