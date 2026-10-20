// Prints the SQL for the game-rules migration from lib/game-catalog.ts.
// Run: npx tsx scripts/gen-game-migration.ts > prisma/migrations/20261020000000_game_rules/migration.sql
import { GAME_CATALOG } from "../lib/game-catalog";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const out: string[] = [];

out.push(`-- Game genres and roster rules, and the launch games that were missing.
-- Safe to run on a database that already has some of these games:
--   * a game that already exists keeps its name, platform category and everything else;
--     only the new genre/rule columns are filled in, and only where they are still empty;
--   * a game that is missing is added.`);
out.push(`
ALTER TABLE "Game" ADD COLUMN "genre" TEXT;
ALTER TABLE "Game" ADD COLUMN "format" TEXT;
ALTER TABLE "Game" ADD COLUMN "teamSizeMin" INTEGER;
ALTER TABLE "Game" ADD COLUMN "teamSizeMax" INTEGER;
ALTER TABLE "Game" ADD COLUMN "maxSubstitutes" INTEGER;
ALTER TABLE "Game" ADD COLUMN "allowsCoach" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Game" ADD COLUMN "rosterNotes" TEXT;
`);

out.push(`-- 1. Add the games that are missing (existing names are skipped, never changed).`);
for (const x of GAME_CATALOG) {
  out.push(
    `INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes")
VALUES (gen_random_uuid()::text, ${q(x.name)}, ${q(x.category)}, true, ${q(x.genre)}, ${q(x.format)}, ${x.teamSizeMin}, ${x.teamSizeMax}, ${x.maxSubstitutes}, ${x.allowsCoach}, ${q(x.notes)})
ON CONFLICT ("name") DO NOTHING;`
  );
}

out.push(`\n-- 2. Fill in genre and rules on games that already existed. Only columns that are still empty are set.`);
for (const x of GAME_CATALOG) {
  out.push(
    `UPDATE "Game" SET "genre" = ${q(x.genre)}, "format" = ${q(x.format)}, "teamSizeMin" = ${x.teamSizeMin}, "teamSizeMax" = ${x.teamSizeMax}, "maxSubstitutes" = ${x.maxSubstitutes}, "allowsCoach" = ${x.allowsCoach}, "rosterNotes" = ${q(x.notes)} WHERE "name" = ${q(x.name)} AND "genre" IS NULL;`
  );
}
console.log(out.join("\n"));
