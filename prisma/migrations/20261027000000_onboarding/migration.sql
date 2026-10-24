-- New-player onboarding: play style, and a marker for "has been through it".

CREATE TYPE "PlayStyle" AS ENUM ('casual', 'competitive');

ALTER TABLE "PlayerProfile" ADD COLUMN "playStyle" "PlayStyle";
ALTER TABLE "PlayerProfile" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Everyone who already has a profile counts as onboarded: only NEW players are sent
-- through the flow. (Anyone still missing a username or date of birth is caught by the
-- "required details" check, which doesn't depend on this column.)
UPDATE "PlayerProfile" SET "onboardedAt" = CURRENT_TIMESTAMP;
