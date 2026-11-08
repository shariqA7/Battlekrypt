-- Game showcase details (Admin -> Games): address, descriptions, pictures, developer,
-- platforms, ordering and a featured flag. All optional, so existing games and the
-- "Request a game" flow keep working unchanged.
ALTER TABLE "Game"
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "shortDescription" TEXT,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "coverImageUrl" TEXT,
    ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "developer" TEXT,
    ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "websiteUrl" TEXT,
    ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- Give every existing game an address: the name in lower case with runs of anything that
-- is not a letter or digit turned into one "-" (same rule as gameSlugBase in
-- lib/game-details.ts). When two names collapse to the same address, the later ones get a
-- short suffix from their id so the unique index below can never fail.
WITH base AS (
    SELECT "id",
           COALESCE(NULLIF(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''), 'game') AS b,
           row_number() OVER (
               PARTITION BY COALESCE(NULLIF(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''), 'game')
               ORDER BY "createdAt", "name"
           ) AS rn
    FROM "Game"
)
UPDATE "Game" g
SET "slug" = CASE WHEN base.rn = 1 THEN base.b ELSE base.b || '-' || substr(g."id", 1, 6) END
FROM base
WHERE g."id" = base."id";

CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");
