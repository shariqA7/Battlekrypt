-- Game genres and roster rules, and the launch games that were missing.
-- Safe to run on a database that already has some of these games:
--   * a game that already exists keeps its name, platform category and everything else;
--     only the new genre/rule columns are filled in, and only where they are still empty;
--   * a game that is missing is added.

ALTER TABLE "Game" ADD COLUMN "genre" TEXT;
ALTER TABLE "Game" ADD COLUMN "format" TEXT;
ALTER TABLE "Game" ADD COLUMN "teamSizeMin" INTEGER;
ALTER TABLE "Game" ADD COLUMN "teamSizeMax" INTEGER;
ALTER TABLE "Game" ADD COLUMN "maxSubstitutes" INTEGER;
ALTER TABLE "Game" ADD COLUMN "allowsCoach" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Game" ADD COLUMN "rosterNotes" TEXT;

-- 1. Add the games that are missing (existing names are skipped, never changed).
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Valorant', 'pc', true, 'FPS / Shooters', 'multiplayer', 5, 5, 1, true, 'Rosters typically need at least 6 players (5 active + 1 sub). Teams may have 1-2 coaches.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Counter-Strike 2', 'pc', true, 'FPS / Shooters', 'multiplayer', 5, 5, 1, true, 'Coaches sit behind the team but are muted during live rounds.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Call of Duty: Warzone', 'pc', true, 'FPS / Shooters', 'multiplayer', 3, 3, 1, true, 'The standard global esports format uses 3-player squads (trios).')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Call of Duty: Black Ops 7', 'pc', true, 'FPS / Shooters', 'multiplayer', 4, 4, 1, true, 'The Call of Duty League format is 4v4 competitive.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Overwatch 2', 'pc', true, 'FPS / Shooters', 'multiplayer', 5, 5, 2, true, '5v5: 1 Tank, 2 Damage, 2 Support.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Rainbow Six Siege X', 'pc', true, 'FPS / Shooters', 'multiplayer', 5, 5, 1, true, '5v5 tactical shooter line-ups.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Crossfire', 'pc', true, 'FPS / Shooters', 'multiplayer', 5, 5, 1, true, 'Traditional 5v5 tactical shooter team structure.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Dota 2', 'pc', true, 'MOBA', 'multiplayer', 5, 5, 1, true, 'Substitutes are rare but allowed under strict tournament stand-in rules.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'League of Legends', 'pc', true, 'MOBA', 'multiplayer', 5, 5, 2, true, 'Coaches take part directly in the live pick and ban phase.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Mobile Legends: Bang Bang', 'mobile', true, 'MOBA', 'multiplayer', 5, 5, 2, true, 'A manager or data analyst is also often registered on stage.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Honor of Kings', 'mobile', true, 'MOBA', 'multiplayer', 5, 5, 2, true, 'Like other mobile MOBAs, coaches manage the pick and ban phase.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Apex Legends', 'pc', true, 'Battle Royale', 'multiplayer', 3, 3, 1, true, 'The ALGS allows a 4th registered roster member as a substitute.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'PUBG: Battlegrounds', 'pc', true, 'Battle Royale', 'multiplayer', 4, 4, 1, true, 'The standard global competitive format is 4-player squads.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'PUBG Mobile', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'Rosters often carry 5 to 6 players in total so they can swap for different maps.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Free Fire', 'mobile', true, 'Battle Royale', 'multiplayer', 4, 4, 2, true, 'Played in 4-player squads with additional backup players.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Fortnite', 'pc', true, 'Battle Royale', 'multiplayer', 2, 2, 0, true, 'The main competitive scene runs Duos; some events use Solos or Trios. No mid-match substitutes.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Tekken 8', 'pc', true, 'Fighting Games', 'one_on_one', 1, 1, 0, true, 'Matches are 1v1. Team leagues use crews of 3 to 4 players.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Street Fighter 6', 'pc', true, 'Fighting Games', 'one_on_one', 1, 1, 0, true, 'Coaches or anchors can support between matches in team league formats.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Fatal Fury: City of the Wolves', 'pc', true, 'Fighting Games', 'one_on_one', 1, 1, 0, true, 'Played entirely as an individual 1v1 fighting game.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'EA Sports FC 26', 'pc', true, 'Sports / Racing', 'one_on_one', 1, 1, 0, true, 'Played individually; players often have a coach or mental trainer on stage.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Rocket League', 'pc', true, 'Sports / Racing', 'multiplayer', 3, 3, 1, true, 'The RLCS format is 3v3, with 1 substitute allowed on the roster.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Trackmania', 'pc', true, 'Sports / Racing', 'both', 1, 2, 1, true, 'Individual time trials as well as 2v2 team formats, depending on the circuit.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Teamfight Tactics', 'pc', true, 'Strategy / Other', 'free_for_all', 1, 1, 0, true, '8 players enter each match individually, so it is a solo strategy game.')
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, 'Chess', 'pc', true, 'Strategy / Other', 'one_on_one', 1, 1, 0, false, 'Traditional 1v1. In team events (Olympiads) a team is 4 active players, 1 reserve and a team captain.')
ON CONFLICT ("name") DO NOTHING;

-- 2. Fill in genre and rules on games that already existed. Only columns that are still empty are set.
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'Rosters typically need at least 6 players (5 active + 1 sub). Teams may have 1-2 coaches.' WHERE "name" = 'Valorant' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'Coaches sit behind the team but are muted during live rounds.' WHERE "name" = 'Counter-Strike 2' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 3, "teamSizeMax" = 3, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'The standard global esports format uses 3-player squads (trios).' WHERE "name" = 'Call of Duty: Warzone' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 4, "teamSizeMax" = 4, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'The Call of Duty League format is 4v4 competitive.' WHERE "name" = 'Call of Duty: Black Ops 7' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 2, "allowsCoach" = true, "rosterNotes" = '5v5: 1 Tank, 2 Damage, 2 Support.' WHERE "name" = 'Overwatch 2' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = '5v5 tactical shooter line-ups.' WHERE "name" = 'Rainbow Six Siege X' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'FPS / Shooters', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'Traditional 5v5 tactical shooter team structure.' WHERE "name" = 'Crossfire' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'MOBA', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'Substitutes are rare but allowed under strict tournament stand-in rules.' WHERE "name" = 'Dota 2' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'MOBA', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 2, "allowsCoach" = true, "rosterNotes" = 'Coaches take part directly in the live pick and ban phase.' WHERE "name" = 'League of Legends' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'MOBA', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 2, "allowsCoach" = true, "rosterNotes" = 'A manager or data analyst is also often registered on stage.' WHERE "name" = 'Mobile Legends: Bang Bang' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'MOBA', "format" = 'multiplayer', "teamSizeMin" = 5, "teamSizeMax" = 5, "maxSubstitutes" = 2, "allowsCoach" = true, "rosterNotes" = 'Like other mobile MOBAs, coaches manage the pick and ban phase.' WHERE "name" = 'Honor of Kings' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Battle Royale', "format" = 'multiplayer', "teamSizeMin" = 3, "teamSizeMax" = 3, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'The ALGS allows a 4th registered roster member as a substitute.' WHERE "name" = 'Apex Legends' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Battle Royale', "format" = 'multiplayer', "teamSizeMin" = 4, "teamSizeMax" = 4, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'The standard global competitive format is 4-player squads.' WHERE "name" = 'PUBG: Battlegrounds' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Battle Royale', "format" = 'multiplayer', "teamSizeMin" = 4, "teamSizeMax" = 4, "maxSubstitutes" = 2, "allowsCoach" = true, "rosterNotes" = 'Rosters often carry 5 to 6 players in total so they can swap for different maps.' WHERE "name" = 'PUBG Mobile' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Battle Royale', "format" = 'multiplayer', "teamSizeMin" = 4, "teamSizeMax" = 4, "maxSubstitutes" = 2, "allowsCoach" = true, "rosterNotes" = 'Played in 4-player squads with additional backup players.' WHERE "name" = 'Free Fire' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Battle Royale', "format" = 'multiplayer', "teamSizeMin" = 2, "teamSizeMax" = 2, "maxSubstitutes" = 0, "allowsCoach" = true, "rosterNotes" = 'The main competitive scene runs Duos; some events use Solos or Trios. No mid-match substitutes.' WHERE "name" = 'Fortnite' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Fighting Games', "format" = 'one_on_one', "teamSizeMin" = 1, "teamSizeMax" = 1, "maxSubstitutes" = 0, "allowsCoach" = true, "rosterNotes" = 'Matches are 1v1. Team leagues use crews of 3 to 4 players.' WHERE "name" = 'Tekken 8' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Fighting Games', "format" = 'one_on_one', "teamSizeMin" = 1, "teamSizeMax" = 1, "maxSubstitutes" = 0, "allowsCoach" = true, "rosterNotes" = 'Coaches or anchors can support between matches in team league formats.' WHERE "name" = 'Street Fighter 6' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Fighting Games', "format" = 'one_on_one', "teamSizeMin" = 1, "teamSizeMax" = 1, "maxSubstitutes" = 0, "allowsCoach" = true, "rosterNotes" = 'Played entirely as an individual 1v1 fighting game.' WHERE "name" = 'Fatal Fury: City of the Wolves' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Sports / Racing', "format" = 'one_on_one', "teamSizeMin" = 1, "teamSizeMax" = 1, "maxSubstitutes" = 0, "allowsCoach" = true, "rosterNotes" = 'Played individually; players often have a coach or mental trainer on stage.' WHERE "name" = 'EA Sports FC 26' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Sports / Racing', "format" = 'multiplayer', "teamSizeMin" = 3, "teamSizeMax" = 3, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'The RLCS format is 3v3, with 1 substitute allowed on the roster.' WHERE "name" = 'Rocket League' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Sports / Racing', "format" = 'both', "teamSizeMin" = 1, "teamSizeMax" = 2, "maxSubstitutes" = 1, "allowsCoach" = true, "rosterNotes" = 'Individual time trials as well as 2v2 team formats, depending on the circuit.' WHERE "name" = 'Trackmania' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Strategy / Other', "format" = 'free_for_all', "teamSizeMin" = 1, "teamSizeMax" = 1, "maxSubstitutes" = 0, "allowsCoach" = true, "rosterNotes" = '8 players enter each match individually, so it is a solo strategy game.' WHERE "name" = 'Teamfight Tactics' AND "genre" IS NULL;
UPDATE "Game" SET "genre" = 'Strategy / Other', "format" = 'one_on_one', "teamSizeMin" = 1, "teamSizeMax" = 1, "maxSubstitutes" = 0, "allowsCoach" = false, "rosterNotes" = 'Traditional 1v1. In team events (Olympiads) a team is 4 active players, 1 reserve and a team captain.' WHERE "name" = 'Chess' AND "genre" IS NULL;
