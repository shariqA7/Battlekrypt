CREATE TABLE "PrizeAward" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cashAmount" DECIMAL(14,2),
    "prizeText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PrizeAward_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrizeAward_tournamentId_idx" ON "PrizeAward"("tournamentId");
ALTER TABLE "PrizeAward" ADD CONSTRAINT "PrizeAward_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
