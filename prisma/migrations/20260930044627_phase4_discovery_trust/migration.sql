-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('like', 'dislike');

-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('warning', 'point_deduction', 'disqualification');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registrationCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TournamentRule" ADD COLUMN     "action" "RuleAction" NOT NULL DEFAULT 'warning',
ADD COLUMN     "appliesToStageId" TEXT,
ADD COLUMN     "penaltyPoints" INTEGER,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suggestedRuleId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "TournamentTemplate" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" "TournamentType" NOT NULL,
    "mode" "TournamentMode" NOT NULL,
    "maxTeamSize" INTEGER,
    "maxTeams" INTEGER NOT NULL,
    "playersPerRoom" INTEGER,
    "format" "TournamentFormat" NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "entryFeeAmount" DECIMAL(14,2),
    "entryFeeCurrency" TEXT,
    "paymentInstructions" TEXT,
    "prizePoolAmount" DECIMAL(14,2),
    "prizePoolCurrency" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "action" "RuleAction" NOT NULL DEFAULT 'warning',
    "penaltyPoints" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "suggestedRuleId" TEXT,

    CONSTRAINT "TemplateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateStage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TemplateStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentVote" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestedRule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action" "RuleAction" NOT NULL DEFAULT 'warning',
    "penaltyPoints" INTEGER,
    "gameCategory" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestedRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentVote_tournamentId_playerId_key" ON "TournamentVote"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRule" ADD CONSTRAINT "TemplateRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TournamentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRule" ADD CONSTRAINT "TemplateRule_suggestedRuleId_fkey" FOREIGN KEY ("suggestedRuleId") REFERENCES "SuggestedRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateStage" ADD CONSTRAINT "TemplateStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TournamentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentVote" ADD CONSTRAINT "TournamentVote_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentVote" ADD CONSTRAINT "TournamentVote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRule" ADD CONSTRAINT "TournamentRule_appliesToStageId_fkey" FOREIGN KEY ("appliesToStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRule" ADD CONSTRAINT "TournamentRule_suggestedRuleId_fkey" FOREIGN KEY ("suggestedRuleId") REFERENCES "SuggestedRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
