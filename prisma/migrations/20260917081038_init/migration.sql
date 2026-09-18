-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('none', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "GameRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('tournament', 'league', 'scrim');

-- CreateEnum
CREATE TYPE "TournamentMode" AS ENUM ('solo', 'duo', 'squad');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('single_elimination', 'double_elimination', 'round_robin', 'points_table', 'league_format');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('free', 'paid');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('draft', 'published', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CompetitiveTier" AS ENUM ('none', 'D', 'C', 'B', 'A', 'S', 'National');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending', 'approved', 'rejected', 'disqualified');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "AddedBy" AS ENUM ('self', 'organizer');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'none',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRequest" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "status" "GameRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedGameId" TEXT,

    CONSTRAINT "GameRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "bio" TEXT,
    "socialLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "type" "TournamentType" NOT NULL,
    "mode" "TournamentMode" NOT NULL,
    "maxTeamSize" INTEGER,
    "maxTeams" INTEGER NOT NULL,
    "playersPerRoom" INTEGER,
    "format" "TournamentFormat" NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "entryFeeAmount" DECIMAL(14,2),
    "entryFeeCurrency" TEXT,
    "prizePoolAmount" DECIMAL(14,2),
    "prizePoolCurrency" TEXT,
    "competitiveTier" "CompetitiveTier" NOT NULL DEFAULT 'none',
    "customFields" JSONB,
    "status" "TournamentStatus" NOT NULL DEFAULT 'draft',
    "startAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3),
    "roomId" TEXT,
    "roomPassword" TEXT,
    "roomRevealAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'upcoming',

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRule" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TournamentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TeamEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamEntryId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT,
    "teamEntryId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'pending',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "paymentProofUrl" TEXT,
    "addedBy" "AddedBy" NOT NULL DEFAULT 'self',
    "disqualifiedRuleId" TEXT,
    "customFieldResponses" JSONB,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Game_name_key" ON "Game"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerProfile_userId_key" ON "OrganizerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_teamEntryId_key" ON "Registration"("teamEntryId");

-- AddForeignKey
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_approvedGameId_fkey" FOREIGN KEY ("approvedGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerProfile" ADD CONSTRAINT "OrganizerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRule" ADD CONSTRAINT "TournamentRule_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntry" ADD CONSTRAINT "TeamEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "TeamEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "TeamEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_disqualifiedRuleId_fkey" FOREIGN KEY ("disqualifiedRuleId") REFERENCES "TournamentRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
