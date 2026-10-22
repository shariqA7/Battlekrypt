-- Ratings per mode (solo / duo / squad). Existing ratings were earned in whatever modes the
-- player entered, so each one moves to the game's MAIN mode: solo for 1-player games, duo
-- for 2, squad for 3 or more (or unknown). New results go to the mode of the tournament.

ALTER TABLE "PlayerGameRating" ADD COLUMN "mode" "TournamentMode";

UPDATE "PlayerGameRating" r
SET "mode" = (CASE
  WHEN g."teamSizeMax" = 1 THEN 'solo'
  WHEN g."teamSizeMax" = 2 THEN 'duo'
  ELSE 'squad'
END)::"TournamentMode"
FROM "Game" g
WHERE g."id" = r."gameId";

UPDATE "PlayerGameRating" SET "mode" = 'squad' WHERE "mode" IS NULL;
ALTER TABLE "PlayerGameRating" ALTER COLUMN "mode" SET NOT NULL;

DROP INDEX "PlayerGameRating_playerId_gameId_key";
CREATE UNIQUE INDEX "PlayerGameRating_playerId_gameId_mode_key" ON "PlayerGameRating"("playerId", "gameId", "mode");
CREATE INDEX "PlayerGameRating_gameId_mode_rating_idx" ON "PlayerGameRating"("gameId", "mode", "rating");
