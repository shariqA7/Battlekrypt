-- D3: prize distribution by finishing position.
CREATE TABLE "PrizeTier" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "positionFrom" INTEGER NOT NULL,
    "positionTo" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PrizeTier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrizeTier_tournamentId_idx" ON "PrizeTier"("tournamentId");

ALTER TABLE "PrizeTier" ADD CONSTRAINT "PrizeTier_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
