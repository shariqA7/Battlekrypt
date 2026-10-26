import { prisma } from "@/lib/prisma";
import type { ClientGeo } from "@/lib/geo";
import type { ParsedUA } from "@/lib/user-agent";
import { visitDetailCutoff } from "@/lib/visit-retention";

const SESSION_WINDOW_MS = 30 * 60 * 1000;

// Records one row per session. Another visit from the same person (same
// account, or same IP + browser when signed out) within 30 minutes is part
// of the same session and is not stored again.
export async function recordVisit(input: {
  userId: string | null;
  geo: ClientGeo;
  ua: ParsedUA;
  userAgent: string | null;
  path: string;
  referrer: string | null;
}) {
  const since = new Date(Date.now() - SESSION_WINDOW_MS);
  const recent = await prisma.visitSession.findFirst({
    where: {
      createdAt: { gte: since },
      ...(input.userId
        ? { userId: input.userId }
        : { userId: null, ip: input.geo.ip, userAgent: input.userAgent }),
    },
    select: { id: true },
  });
  if (recent) return { recorded: false };

  await prisma.visitSession.create({
    data: {
      userId: input.userId,
      ip: input.geo.ip,
      country: input.geo.country,
      region: input.geo.region,
      city: input.geo.city,
      deviceType: input.ua.deviceType,
      os: input.ua.os,
      browser: input.ua.browser,
      path: input.path.slice(0, 300),
      referrer: input.referrer?.slice(0, 300) ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { recorded: true };
}

// Privacy housekeeping (run daily by /api/cron/visit-retention): once a visit is
// older than VISIT_DETAIL_RETENTION_DAYS, erase everything that could point at a
// person (IP address, city, browser string, the account link). The row itself
// stays, as an anonymous count by day, country, region, device and page, so the
// traffic and dashboard charts keep their history.
export async function anonymizeOldVisits(now: Date = new Date()) {
  const { count } = await prisma.visitSession.updateMany({
    where: {
      createdAt: { lt: visitDetailCutoff(now) },
      OR: [{ ip: { not: null } }, { city: { not: null } }, { userAgent: { not: null } }, { userId: { not: null } }],
    },
    data: { ip: null, city: null, userAgent: null, userId: null },
  });
  return count;
}
