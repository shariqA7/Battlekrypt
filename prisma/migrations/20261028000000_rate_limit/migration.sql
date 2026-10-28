-- Shared counters for rate limiting (lib/rate-limit.ts).

CREATE TABLE "RateLimitBucket" (
    "keyHash" TEXT NOT NULL,
    "bucket" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("keyHash", "bucket")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
