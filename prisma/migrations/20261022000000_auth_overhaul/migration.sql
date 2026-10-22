-- Sign up overhaul: username, consent records, guardian email, Twitch switch.

ALTER TABLE "PlayerProfile" ADD COLUMN "username" TEXT;
ALTER TABLE "PlayerProfile" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "PlayerProfile" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "PlayerProfile" ADD COLUMN "marketingEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlayerProfile" ADD COLUMN "marketingEmailAt" TIMESTAMP(3);
ALTER TABLE "PlayerProfile" ADD COLUMN "guardianEmail" TEXT;

CREATE UNIQUE INDEX "PlayerProfile_username_key" ON "PlayerProfile"("username");

ALTER TABLE "SiteSettings" ADD COLUMN "twitchLoginEnabled" BOOLEAN NOT NULL DEFAULT false;
