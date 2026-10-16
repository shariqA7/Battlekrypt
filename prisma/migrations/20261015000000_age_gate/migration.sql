-- Age gate: a self-declared date of birth on the player, and a minimum age per tournament.
ALTER TABLE "PlayerProfile" ADD COLUMN "birthDate" DATE;
ALTER TABLE "Tournament" ADD COLUMN "minAge" INTEGER NOT NULL DEFAULT 13;
