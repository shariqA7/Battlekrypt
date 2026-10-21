// Prints the SQL for the East/Southeast Asia regional-games migration from lib/game-regions.ts.
// Run: npx tsx scripts/gen-east-asia-games-migration.ts > prisma/migrations/20261021010000_east_asia_game_regions/migration.sql
import { EAST_ASIA_BLOCKED, EAST_ASIA_LOCAL } from "../lib/game-regions";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a: string[]) => `ARRAY[${a.map(q).join(", ")}]::TEXT[]`;
const out: string[] = [];

out.push(`-- Regional versions for East and Southeast Asia. Builds on 20261020010000_game_regions.
-- Existing games keep their id, name and platform category; countries are only ever added to a
-- game's blocked list, never removed, and a missing local version is added.
`);

out.push(`-- 1. Hide the global versions in more countries (merged with the countries already listed).`);
for (const r of EAST_ASIA_BLOCKED) {
  out.push(
    `UPDATE "Game" SET "blockedInCountries" = ARRAY(SELECT DISTINCT c FROM unnest("blockedInCountries" || ${arr(r.blockedIn)}) AS c ORDER BY c) WHERE "name" = ${q(r.name)};`
  );
}

out.push(`\n-- 2. Add the local versions (an existing name is skipped, never changed).`);
for (const v of EAST_ASIA_LOCAL) {
  out.push(
    `INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, ${q(v.name)}, ${q(v.category)}, true, ${q(v.genre)}, ${q(v.format)}, ${v.teamSizeMin}, ${v.teamSizeMax}, ${v.maxSubstitutes}, true, ${q(v.notes)}, ${arr(v.onlyIn)}, ${q(v.localVersionOf)})
ON CONFLICT ("name") DO NOTHING;`
  );
}
console.log(out.join("\n"));
