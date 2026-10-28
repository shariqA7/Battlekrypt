// The shared (database) rate limiter. Needs a migrated, empty Postgres (npm test provides one).
import { prisma } from "../lib/prisma";
import { memoryRateLimit, purgeExpiredBuckets, rateLimit, type RateStore } from "../lib/rate-limit";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const W = 60_000; // one-minute windows
const T0 = Math.floor(1_900_000_000_000 / W) * W; // the exact start of a window

async function main() {
  // ---- basics
  const r = [];
  for (let i = 0; i < 4; i++) r.push(await rateLimit("t-basic", 3, W, T0 + i * 100));
  ok("allows up to the maximum", r.slice(0, 3).every((x) => x.allowed));
  ok("blocks the next one", !r[3].allowed);
  ok("says how long to wait (to the end of the window, at most)", r[3].retryAfterSec >= 1 && r[3].retryAfterSec <= 60);
  ok("different keys count separately", (await rateLimit("t-other", 3, W, T0 + 500)).allowed);
  ok("the same key with a different window is a different counter", (await rateLimit("t-basic", 3, W * 2, T0 + 600)).allowed);

  // ---- windows
  ok("frees up two windows later", (await rateLimit("t-basic", 3, W, T0 + 3 * W)).allowed);

  // ---- the boundary burst a plain fixed window lets through
  const edge = "t-edge";
  for (let i = 0; i < 5; i++) await rateLimit(edge, 5, W, T0 + 10 * W + 55_000 + i); // 5 hits in the last 5 seconds of a window
  const early = await rateLimit(edge, 5, W, T0 + 11 * W + 1_000); // 1 second into the next window
  ok("full allowance at the end of one window doesn't reset at the start of the next", !early.allowed);
  const late = await rateLimit("t-edge-late", 5, W, T0 + 11 * W + 59_000);
  ok("(a fresh key is of course fine)", late.allowed);

  // ---- shared state, and what is stored
  const rows = await prisma.$queryRaw<{ keyHash: string; count: number }[]>`SELECT "keyHash", "count" FROM "RateLimitBucket"`;
  ok("counters are in the database, so every server instance sees them", rows.length >= 5 && rows.some((x) => x.count >= 3));
  await rateLimit("login-acct:someone@example.com", 8, W, T0);
  const all = await prisma.$queryRaw<{ keyHash: string }[]>`SELECT "keyHash" FROM "RateLimitBucket"`;
  ok("keys are stored hashed: no email or IP in the table", all.every((x) => /^[0-9a-f]{64}$/.test(x.keyHash)) && !JSON.stringify(all).includes("someone@example.com"));

  // ---- many requests at once (the case a read-then-write counter gets wrong)
  const parallel = await Promise.all(Array.from({ length: 50 }, () => rateLimit("t-parallel", 20, W, T0 + 20 * W + 5)));
  ok("50 simultaneous requests: exactly 20 allowed", parallel.filter((x) => x.allowed).length === 20);
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`SELECT "count" FROM "RateLimitBucket" WHERE "bucket" = ${Math.floor((T0 + 20 * W + 5) / W)} AND "expiresAt" > now() - interval '100 years' ORDER BY "count" DESC LIMIT 1`;
  ok("none were lost: the stored count is exactly 50", count === 50);

  // ---- cleanup
  const before = await prisma.rateLimitBucket.count();
  const removed = await purgeExpiredBuckets(T0 + 100 * W);
  ok("expired windows can be purged", removed > 0 && (await prisma.rateLimitBucket.count()) < before);
  const live = await rateLimit("t-live", 3, W, Date.now());
  await purgeExpiredBuckets();
  ok("purging 'now' leaves current counters alone", live.allowed && (await prisma.rateLimitBucket.count({ where: { expiresAt: { gt: new Date() } } })) >= 1);

  // ---- the database goes away: fall back to in-memory counting, never lock people out
  const broken: RateStore = { hit: async () => { throw new Error("database is down"); } };
  const realError = console.error;
  const logged: unknown[][] = [];
  console.error = (...a: unknown[]) => { logged.push(a); };
  const fb = [];
  for (let i = 0; i < 4; i++) fb.push(await rateLimit("t-fallback", 3, W, T0 + 30 * W + i, broken));
  console.error = realError;
  ok("with the database down, requests are still allowed up to the limit", fb.slice(0, 3).every((x) => x.allowed));
  ok("and the limit still applies, in memory", !fb[3].allowed);
  ok("the outage is logged, once, not for every request", logged.length === 1);

  ok("the in-memory limiter on its own still works", memoryRateLimit("m", 1, W, T0).allowed && !memoryRateLimit("m", 1, W, T0 + 1).allowed);
}
main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); console.log(fails ? `\n${fails} FAILED` : "\nAll passed"); process.exit(fails ? 1 : 0); });
