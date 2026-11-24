// Prints the SQL for the match-limits migration from lib/game-catalog.ts.
// Run: npx tsx scripts/gen-match-limits-migration.ts > prisma/migrations/20261125000000_game_match_limits/migration.sql
import { MATCH_LIMITS } from "../lib/game-catalog";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const out: string[] = [];
out.push(`-- How many entries (teams, or players in solo games) one match or room holds, per game.
-- Only games that have no limit yet are filled in, so a value an admin has already set is never overwritten.
ALTER TABLE "Game" ADD COLUMN "maxPerMatch" INTEGER;
ALTER TABLE "Game" ADD COLUMN "matchLimitNote" TEXT;
`);
for (const [name, l] of Object.entries(MATCH_LIMITS)) {
  out.push(`UPDATE "Game" SET "maxPerMatch" = ${l.max}, "matchLimitNote" = ${q(l.note)} WHERE "name" = ${q(name)} AND "maxPerMatch" IS NULL;`);
}
console.log(out.join("\n"));
