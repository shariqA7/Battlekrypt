// Rate limiting for the sign-in, sign-up and email routes.
//
// The counts live in Postgres (RateLimitBucket), so ALL server instances share them: an
// in-memory counter only stops a script per server, and a serverless host can run dozens.
// If the database can't be reached the limiter falls back to counting in memory, so a
// database hiccup never locks everyone out of logging in.
//
// Method: a sliding window estimated from two fixed windows (the current one, plus the
// previous one weighted by how much of it still overlaps). That avoids the classic hole in
// plain fixed windows, where someone sends the full allowance at the end of one window and
// again at the start of the next.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface LimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

// ---------------- in-memory version (fallback, and used directly by tests) ----------------
const hits = new Map<string, number[]>();

export function memoryRateLimit(key: string, max: number, windowMs: number, now = Date.now()): LimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { allowed: true, retryAfterSec: 0 };
}

// ---------------- shared (database) version ----------------

// Counts of the current and the previous window for a key, after recording this attempt.
export interface RateStore {
  hit(keyHash: string, bucket: number, windowMs: number, now: number): Promise<{ current: number; previous: number }>;
}

export const dbStore: RateStore = {
  async hit(keyHash, bucket, windowMs, now) {
    const expiresAt = new Date((bucket + 2) * windowMs);
    // One round trip: record this attempt and read the previous window together.
    const rows = await prisma.$queryRaw<{ current: number; previous: number }[]>`
      WITH cur AS (
        INSERT INTO "RateLimitBucket" ("keyHash", "bucket", "count", "expiresAt")
        VALUES (${keyHash}, ${bucket}, 1, ${expiresAt})
        ON CONFLICT ("keyHash", "bucket") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
        RETURNING "count"
      )
      SELECT
        (SELECT "count" FROM cur)::int AS current,
        COALESCE((SELECT "count" FROM "RateLimitBucket" WHERE "keyHash" = ${keyHash} AND "bucket" = ${bucket - 1}), 0)::int AS previous
    `;
    // Housekeeping: now and then, drop windows that can no longer matter.
    if (Math.random() < 0.01) void purgeExpiredBuckets(now).catch(() => undefined);
    return { current: rows[0].current, previous: rows[0].previous };
  },
};

// Deletes counters whose windows are over. Called occasionally by the limiter itself.
export async function purgeExpiredBuckets(now: number = Date.now()): Promise<number> {
  return prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "expiresAt" < ${new Date(now)}`;
}

// Keys hold emails and IP addresses, so only a hash is stored. The window is part of the hash
// so the same key used with two different windows can't collide.
const hashKey = (key: string, windowMs: number) => createHash("sha256").update(`${key}|${windowMs}`).digest("hex");

let warnedAt = 0;

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
  store: RateStore = dbStore
): Promise<LimitResult> {
  const bucket = Math.floor(now / windowMs);
  try {
    const { current, previous } = await store.hit(hashKey(key, windowMs), bucket, windowMs, now);
    const elapsed = (now - bucket * windowMs) / windowMs; // 0..1 into the current window
    const estimate = current + previous * (1 - elapsed);
    if (estimate <= max) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000)) };
  } catch (error) {
    // Don't lock people out because the counter is unavailable; log it (at most once a minute).
    if (now - warnedAt > 60_000) {
      warnedAt = now;
      console.error("rate limiter: database unavailable, using in-memory counts", error);
    }
    return memoryRateLimit(key, max, windowMs, now);
  }
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export function tooManyChecks(retryAfterSec: number) {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return [{ id: "rate_limit", ok: false, message: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` }];
}
