-- Regional game versions: hide a game where it is blocked, and show its local version only there.
-- Existing games keep their id, name and platform category; only the new columns are filled, and
-- only where still empty. A missing local version is added.

ALTER TABLE "Game" ADD COLUMN "onlyInCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Game" ADD COLUMN "blockedInCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Game" ADD COLUMN "localVersionOf" TEXT;

-- 1. Hide the global versions in the countries where they are blocked.
UPDATE "Game" SET "blockedInCountries" = ARRAY['IN']::TEXT[] WHERE "name" = 'Mobile Legends: Bang Bang' AND cardinality("blockedInCountries") = 0;
UPDATE "Game" SET "blockedInCountries" = ARRAY['IN']::TEXT[] WHERE "name" = 'Free Fire' AND cardinality("blockedInCountries") = 0;
UPDATE "Game" SET "blockedInCountries" = ARRAY['IN']::TEXT[] WHERE "name" = 'PUBG Mobile' AND cardinality("blockedInCountries") = 0;

-- 2. Add the local versions that are missing (an existing name is skipped, never changed).
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'Moba Legends: 5v5!', 'mobile', true, 'MOBA', 'multiplayer', 5, 5, 2, true, 'India''s version of Mobile Legends: Bang Bang, published by Vizta Games. Same 5v5 format and rosters as the global game.', ARRAY['IN']::TEXT[], 'Mobile Legends: Bang Bang')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'Free Fire MAX', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'The version of Free Fire playable in India (the original is banned there). Played in 4-player squads with backup players.', ARRAY['IN']::TEXT[], 'Free Fire')
ON CONFLICT ("name") DO NOTHING;

-- 3. Games that already exist and are local versions: set where they are shown, and fill empty rule columns.
UPDATE "Game" SET "onlyInCountries" = ARRAY['IN']::TEXT[], "localVersionOf" = 'PUBG Mobile', "genre" = COALESCE("genre", 'Battle Royale'), "format" = COALESCE("format", 'multiplayer'), "teamSizeMin" = COALESCE("teamSizeMin", 4), "teamSizeMax" = COALESCE("teamSizeMax", 4), "maxSubstitutes" = COALESCE("maxSubstitutes", 2), "rosterNotes" = COALESCE("rosterNotes", 'Battlegrounds Mobile India, India''s version of PUBG Mobile. Same 4-player squads and rosters as PUBG Mobile.') WHERE "name" = 'BGMI' AND cardinality("onlyInCountries") = 0;
