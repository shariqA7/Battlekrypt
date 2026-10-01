-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "planCode" TEXT NOT NULL DEFAULT 'organizer_free',
ADD COLUMN     "planExpiresAt" TIMESTAMP(3);
