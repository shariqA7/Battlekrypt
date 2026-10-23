ALTER TABLE "Tournament"
    ADD COLUMN "cancelRefundsDueAt" TIMESTAMP(3),
    ADD COLUMN "refundsConfirmedAt" TIMESTAMP(3);

CREATE TYPE "ChangeKind" AS ENUM ('prize_pool', 'cancel', 'conditions', 'other');
CREATE TYPE "ChangeStatus" AS ENUM ('pending', 'approved', 'denied');

CREATE TABLE "TournamentChangeRequest" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" "ChangeKind" NOT NULL,
    "details" TEXT NOT NULL,
    "payload" JSONB,
    "status" "ChangeStatus" NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TournamentChangeRequest_tournamentId_idx" ON "TournamentChangeRequest"("tournamentId");
CREATE INDEX "TournamentChangeRequest_status_idx" ON "TournamentChangeRequest"("status");
ALTER TABLE "TournamentChangeRequest" ADD CONSTRAINT "TournamentChangeRequest_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
