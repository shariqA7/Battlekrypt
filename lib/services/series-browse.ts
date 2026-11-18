// Browse pages show ONE card per recurring series (its next open session), not one card per day.
import { prisma } from "@/lib/prisma";

export async function nextSessionIdsBySeries(now = new Date()): Promise<string[]> {
  const rows = await prisma.tournament.findMany({
    where: { seriesId: { not: null }, status: { in: ["published", "registration_open"] }, startAt: { gt: now } },
    orderBy: { startAt: "asc" },
    select: { id: true, seriesId: true },
  });
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) {
    if (r.seriesId && !seen.has(r.seriesId)) { seen.add(r.seriesId); ids.push(r.id); }
  }
  return ids;
}
