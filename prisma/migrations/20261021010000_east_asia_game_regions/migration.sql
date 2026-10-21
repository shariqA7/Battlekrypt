-- Regional versions for East and Southeast Asia. Builds on 20261020010000_game_regions.
-- Existing games keep their id, name and platform category; countries are only ever added to a
-- game's blocked list, never removed, and a missing local version is added.

-- 1. Hide the global versions in more countries (merged with the countries already listed).
UPDATE "Game" SET "blockedInCountries" = ARRAY(SELECT DISTINCT c FROM unnest("blockedInCountries" || ARRAY['CN', 'KR', 'JP', 'VN', 'TW']::TEXT[]) AS c ORDER BY c) WHERE "name" = 'PUBG Mobile';
UPDATE "Game" SET "blockedInCountries" = ARRAY(SELECT DISTINCT c FROM unnest("blockedInCountries" || ARRAY['TH', 'VN', 'TW']::TEXT[]) AS c ORDER BY c) WHERE "name" = 'Honor of Kings';

-- 2. Add the local versions (an existing name is skipped, never changed).
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'Game for Peace', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'China''s version of PUBG Mobile, published by Tencent. Same 4-player squads and rosters as PUBG Mobile.', ARRAY['CN']::TEXT[], 'PUBG Mobile')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'PUBG Mobile KRJP', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'The Korea and Japan version of PUBG Mobile, published by Krafton. Same 4-player squads and rosters.', ARRAY['KR', 'JP']::TEXT[], 'PUBG Mobile')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'PUBG Mobile VN', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'Vietnam''s version of PUBG Mobile, published by VNG. Same 4-player squads and rosters.', ARRAY['VN']::TEXT[], 'PUBG Mobile')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'PUBG Mobile TW', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'Taiwan''s version of PUBG Mobile. Same 4-player squads and rosters.', ARRAY['TW']::TEXT[], 'PUBG Mobile')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, 'Arena of Valor', 'mobile', true, 'MOBA', 'multiplayer', 5, 5, 2, true, 'Garena''s version of the Tencent MOBA for Thailand, Vietnam and Taiwan, where Honor of Kings is not offered. Same 5v5 format and rosters.', ARRAY['TH', 'VN', 'TW']::TEXT[], 'Honor of Kings')
ON CONFLICT ("name") DO NOTHING;
