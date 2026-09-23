/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Tournament` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `Tournament` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "favoriteGames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hobbies" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "mobileNumber" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "placement" INTEGER,
ADD COLUMN     "points" INTEGER;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");
