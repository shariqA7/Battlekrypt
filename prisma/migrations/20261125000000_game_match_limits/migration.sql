-- How many entries (teams, or players in solo games) one match or room holds, per game.
-- Only games that have no limit yet are filled in, so a value an admin has already set is never overwritten.
ALTER TABLE "Game" ADD COLUMN "maxPerMatch" INTEGER;
ALTER TABLE "Game" ADD COLUMN "matchLimitNote" TEXT;

UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Valorant' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Counter-Strike 2' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 50, "matchLimitNote" = 'Trios. Verdansk holds up to 150 players (50 trios); other maps and modes hold 100 to 120. Lower it for a smaller map.' WHERE "name" = 'Call of Duty: Warzone' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '4v4. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Call of Duty: Black Ops 7' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Overwatch 2' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Rainbow Six Siege X' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Crossfire' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Dota 2' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'League of Legends' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Mobile Legends: Bang Bang' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '5v5. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Honor of Kings' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 20, "matchLimitNote" = '20 trios (60 players). This is the lobby size EA uses in the Apex Legends Global Series.' WHERE "name" = 'Apex Legends' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 25, "matchLimitNote" = 'A full public lobby is 100 players, which is 25 squads of 4. Official esports rooms use 16 squads (64 players).' WHERE "name" = 'PUBG: Battlegrounds' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 25, "matchLimitNote" = 'Up to 100 players, which is 25 squads of 4. Official PUBG Mobile esports groups use 16 squads.' WHERE "name" = 'PUBG Mobile' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 12, "matchLimitNote" = 'Garena''s tournament rulebooks allow at most 12 squads of 4 on one map. The public lobby holds 50 players.' WHERE "name" = 'Free Fire' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 50, "matchLimitNote" = 'A lobby holds 100 players, which is 50 duos. Epic''s Fortnite Championship Series uses 50 duos in its finals.' WHERE "name" = 'Fortnite' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '1v1. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Tekken 8' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '1v1. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Street Fighter 6' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '1v1. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Fatal Fury: City of the Wolves' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '1v1. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'EA Sports FC 26' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '3v3. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Rocket League' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 64, "matchLimitNote" = 'Up to 64 players on one match server, as in the official Cup of the Day.' WHERE "name" = 'Trackmania' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 8, "matchLimitNote" = '8 players in every lobby (Riot''s tournament format).' WHERE "name" = 'Teamfight Tactics' AND "maxPerMatch" IS NULL;
UPDATE "Game" SET "maxPerMatch" = 2, "matchLimitNote" = '1v1. A match is always two sides, so a tournament runs as a bracket or league.' WHERE "name" = 'Chess' AND "maxPerMatch" IS NULL;
