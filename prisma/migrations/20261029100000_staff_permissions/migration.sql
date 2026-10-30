-- Staff roles and per-section permissions for the admin panel.
CREATE TYPE "StaffRole" AS ENUM ('super_admin', 'admin', 'manager');
CREATE TYPE "StaffAccess" AS ENUM ('view', 'edit');

ALTER TABLE "User"
    ADD COLUMN "staffRole" "StaffRole",
    ADD COLUMN "staffActive" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "staffAddedById" TEXT,
    ADD COLUMN "staffAddedAt" TIMESTAMP(3);

-- Every admin who exists today keeps full access: they become super admins. The owner can
-- demote extra ones from the Staff page.
UPDATE "User" SET "staffRole" = 'super_admin' WHERE "isAdmin" = true;

CREATE TABLE "StaffPermission" (
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "access" "StaffAccess" NOT NULL DEFAULT 'edit',

    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("userId", "permission")
);

ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
