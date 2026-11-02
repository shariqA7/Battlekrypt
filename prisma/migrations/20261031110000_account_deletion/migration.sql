-- Account deletion: request, cooling-off, and a record of each erasure.
ALTER TABLE "User"
    ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
    ADD COLUMN "deletionDueAt" TIMESTAMP(3),
    ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "AccountErasure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3),
    "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filesRemoved" INTEGER NOT NULL DEFAULT 0,
    "filesKept" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "AccountErasure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountErasure_userId_idx" ON "AccountErasure"("userId");
