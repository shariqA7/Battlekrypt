ALTER TABLE "SiteSettings" ADD COLUMN "organizerRatingsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "OrganizerRating" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" TEXT,
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizerRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrganizerRating_stars_check" CHECK ("stars" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "OrganizerRating_tournamentId_raterUserId_key" ON "OrganizerRating"("tournamentId", "raterUserId");
CREATE INDEX "OrganizerRating_organizerId_hiddenAt_idx" ON "OrganizerRating"("organizerId", "hiddenAt");
CREATE INDEX "OrganizerRating_raterUserId_createdAt_idx" ON "OrganizerRating"("raterUserId", "createdAt");
ALTER TABLE "OrganizerRating" ADD CONSTRAINT "OrganizerRating_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizerRating" ADD CONSTRAINT "OrganizerRating_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
