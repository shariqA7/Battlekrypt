-- AlterTable
ALTER TABLE "ClubRoster" ADD COLUMN     "isCaptain" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TeamEntry" ADD COLUMN     "clubTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "TeamEntry" ADD CONSTRAINT "TeamEntry_clubTeamId_fkey" FOREIGN KEY ("clubTeamId") REFERENCES "ClubTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
