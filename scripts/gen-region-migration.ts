// Prints the SQL for the regional-games migration from lib/game-regions.ts.
// Run: npx tsx scripts/gen-region-migration.ts > prisma/migrations/20261020010000_game_regions/migration.sql
import { BLOCKED_RULES, LOCAL_VERSIONS } from "../lib/game-regions";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a: string[]) => `ARRAY[${a.map(q).join(", ")}]::TEXT[]`;
const out: string[] = [];

out.push(`-- Regional game versions: hide a game where it is blocked, and show its local version only there.
-- Existing games keep their id, name and platform category; only the new columns are filled, and
-- only where still empty. A missing local version is added.
`);
out.push(`ALTER TABLE "Game" ADD COLUMN "onlyInCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Game" ADD COLUMN "blockedInCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Game" ADD COLUMN "localVersionOf" TEXT;
`);

out.push(`-- 1. Hide the global versions in the countries where they are blocked.`);
for (const r of BLOCKED_RULES) {
  out.push(`UPDATE "Game" SET "blockedInCountries" = ${arr(r.blockedIn)} WHERE "name" = ${q(r.name)} AND cardinality("blockedInCountries") = 0;`);
}

out.push(`\n-- 2. Add the local versions that are missing (an existing name is skipped, never changed).`);
for (const v of LOCAL_VERSIONS.filter((x) => !x.existing)) {
  out.push(
    `INSERT INTO "Game" ("id", "name", "category", "isApproved", "genre", "format", "teamSizeMin", "teamSizeMax", "maxSubstitutes", "allowsCoach", "rosterNotes", "onlyInCountries", "localVersionOf")
VALUES (gen_random_uuid()::text, ${q(v.name)}, ${q(v.category)}, true, ${q(v.genre)}, ${q(v.format)}, ${v.teamSizeMin}, ${v.teamSizeMax}, ${v.maxSubstitutes}, true, ${q(v.notes)}, ${arr(v.onlyIn)}, ${q(v.localVersionOf)})
ON CONFLICT ("name") DO NOTHING;`
  );
}

out.push(`\n-- 3. Games that already exist and are local versions: set where they are shown, and fill empty rule columns.`);
for (const v of LOCAL_VERSIONS.filter((x) => x.existing)) {
  out.push(
    `UPDATE "Game" SET "onlyInCountries" = ${arr(v.onlyIn)}, "localVersionOf" = ${q(v.localVersionOf)}, "genre" = COALESCE("genre", ${q(v.genre)}), "format" = COALESCE("format", ${q(v.format)}), "teamSizeMin" = COALESCE("teamSizeMin", ${v.teamSizeMin}), "teamSizeMax" = COALESCE("teamSizeMax", ${v.teamSizeMax}), "maxSubstitutes" = COALESCE("maxSubstitutes", ${v.maxSubstitutes}), "rosterNotes" = COALESCE("rosterNotes", ${q(v.notes)}) WHERE "name" = ${q(v.name)} AND cardinality("onlyInCountries") = 0;`
  );
}
console.log(out.join("\n"));
