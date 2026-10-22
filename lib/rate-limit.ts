// Small in-memory limiter for the auth routes. Best effort: each server instance keeps
// its own counts, so it slows scripts down but is not a hard global cap (Supabase also
// rate-limits its own auth endpoints). Swap for Redis/Upstash if abuse becomes real.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { allowed: false as const, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { allowed: true as const, retryAfterSec: 0 };
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export function tooManyChecks(retryAfterSec: number) {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return [{ id: "rate_limit", ok: false, message: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` }];
}
