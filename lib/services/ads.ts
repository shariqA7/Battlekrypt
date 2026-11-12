// Sponsor ads: campaigns an admin sells directly, which one is shown where, and the daily
// view/click counts. Nothing personal is stored: only per-campaign, per-day totals.
import { prisma } from "@/lib/prisma";
import {
  isLive, matchesViewer, pickWeighted, validateAdsense, validateCampaign,
  type AdPlacement, type AdViewer,
} from "@/lib/ad-rules";

const today = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };

export type ShownAd = { id: string; imageUrl: string; altText: string };

/** The banner to show on this placement for this viewer, or null if no campaign fits. */
export async function pickAd(placement: AdPlacement, viewer: AdViewer, now = new Date(), random: () => number = Math.random): Promise<ShownAd | null> {
  const rows = await prisma.adCampaign.findMany({
    where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], placements: { has: placement } },
    select: { id: true, imageUrl: true, altText: true, weight: true, audience: true, active: true, startsAt: true, endsAt: true },
  });
  const fits = rows.filter((c) => isLive(c, now) && matchesViewer(c.audience, viewer));
  const c = pickWeighted(fits, random);
  return c ? { id: c.id, imageUrl: c.imageUrl, altText: c.altText } : null;
}

async function bump(campaignId: string, field: "impressions" | "clicks") {
  const day = today();
  const where = { campaignId_day: { campaignId, day } };
  const inc = { [field]: { increment: 1 } };
  try {
    await prisma.adDailyStat.upsert({ where, create: { campaignId, day, [field]: 1 }, update: inc });
  } catch {
    // Two first views of the day at the same moment: the second one's insert loses. Count it as an update.
    await prisma.adDailyStat.update({ where, data: inc }).catch(() => undefined);
  }
}

/** Count a view of a banner (called once, when the banner scrolls into view). */
export async function recordView(id: string, now = new Date()) {
  const c = await prisma.adCampaign.findUnique({ where: { id }, select: { active: true, startsAt: true, endsAt: true } });
  if (!c || !isLive(c, now)) return false;
  await bump(id, "impressions");
  return true;
}

/** Count a click and return where it goes. A campaign that has ended still sends people on, but isn't counted. */
export async function recordClick(id: string, now = new Date(), count = true) {
  const c = await prisma.adCampaign.findUnique({ where: { id }, select: { linkUrl: true, active: true, startsAt: true, endsAt: true } });
  if (!c) return null;
  if (count && isLive(c, now)) await bump(id, "clicks");
  return c.linkUrl;
}

export async function createCampaign(adminId: string, raw: Record<string, unknown>) {
  const v = validateCampaign(raw);
  if (!v.ok) return { error: "validation_error" as const, message: v.message };
  const row = await prisma.adCampaign.create({ data: { ...v.value, createdById: adminId }, select: { id: true } });
  return { data: row };
}

export async function updateCampaign(id: string, raw: Record<string, unknown>) {
  const existing = await prisma.adCampaign.findUnique({ where: { id } });
  if (!existing) return { error: "not_found" as const };
  // A switch on/off sends only { active }; an edit sends the whole form.
  const onlyActive = Object.keys(raw).length === 1 && typeof raw.active === "boolean";
  if (onlyActive) {
    await prisma.adCampaign.update({ where: { id }, data: { active: raw.active as boolean } });
    return { data: { id } };
  }
  const v = validateCampaign(raw);
  if (!v.ok) return { error: "validation_error" as const, message: v.message };
  await prisma.adCampaign.update({ where: { id }, data: v.value });
  return { data: { id } };
}

export async function deleteCampaign(id: string) {
  const r = await prisma.adCampaign.deleteMany({ where: { id } });
  return r.count === 0 ? { error: "not_found" as const } : { data: { id } };
}

export async function listCampaignsWithStats(now = new Date()) {
  const [rows, totals, recent] = await Promise.all([
    prisma.adCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.adDailyStat.groupBy({ by: ["campaignId"], _sum: { impressions: true, clicks: true } }),
    prisma.adDailyStat.groupBy({
      by: ["campaignId"], _sum: { impressions: true, clicks: true },
      where: { day: { gte: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } },
    }),
  ]);
  const t = new Map(totals.map((x) => [x.campaignId, x._sum]));
  const r = new Map(recent.map((x) => [x.campaignId, x._sum]));
  return rows.map((c) => ({
    ...c,
    paidAmount: c.paidAmount ? Number(c.paidAmount.toString()) : null,
    live: isLive(c, now),
    impressions: t.get(c.id)?.impressions ?? 0,
    clicks: t.get(c.id)?.clicks ?? 0,
    impressions30: r.get(c.id)?.impressions ?? 0,
    clicks30: r.get(c.id)?.clicks ?? 0,
  }));
}

export async function getAdsenseSettings() {
  const s = await prisma.siteSettings.findUnique({
    where: { id: "singleton" },
    select: { adsEnabled: true, adsenseClientId: true, adsenseSlotBrowse: true, adsenseSlotTournament: true, adsenseSlotDashboard: true, adsenseEuConsentReady: true },
  });
  return {
    adsEnabled: s?.adsEnabled ?? false,
    adsenseClientId: s?.adsenseClientId ?? null,
    adsenseSlotBrowse: s?.adsenseSlotBrowse ?? null,
    adsenseSlotTournament: s?.adsenseSlotTournament ?? null,
    adsenseSlotDashboard: s?.adsenseSlotDashboard ?? null,
    adsenseEuConsentReady: s?.adsenseEuConsentReady ?? false,
  };
}

export async function updateAdsenseSettings(raw: Record<string, unknown>) {
  const v = validateAdsense(raw);
  if (!v.ok) return { error: "validation_error" as const, message: v.message };
  if (Object.keys(v.value).length === 0) return { error: "validation_error" as const, message: "Nothing to update." };
  await prisma.siteSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...v.value }, update: v.value });
  return { data: v.value };
}
