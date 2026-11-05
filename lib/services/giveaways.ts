// Giveaways.
//
// Run by the PLATFORM (an admin, often for a sponsoring brand) or by an ORGANIZER. Entry can be
// limited to "verified" accounts (on a paid plan, see lib/verified.ts); only an admin decides that:
// an organizer's giveaway follows the platform default, and an admin can override it on any one.
//
// Life of a giveaway:  draft -> (pending_review ->) active -> ended   (or cancelled / rejected)
//   - An organizer's giveaway goes live at once, or waits for an admin when the prize is worth more
//     than the review limit. An admin's goes live when the admin says so.
//   - When it closes, the host (or an admin) draws the winners at random.
//   - Each winner sends delivery details, the host delivers, the winner confirms (or disputes).
//   - A winner who never answers can be replaced by a new random draw.
import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";
import { getVerifiedStatus } from "@/lib/verified";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { notify, notifyMany } from "@/lib/services/notifications";
import { startOfMonthUtc } from "@/lib/services/plan-gates";
import { getOrganizerTrustSummary } from "@/lib/services/organizer-trust";
import { getOrganizerPause } from "@/lib/services/organizer-reports";
import { isPosterFrozen } from "@/lib/services/challenge-fulfillment";
import { cashAgeCheck } from "@/lib/challenge-integrity-rules";

export const MAX_WINNERS = 100;
export const MAX_DAYS_OPEN = 90;
const DAY_MS = 86_400_000;
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));

export type Actor = { userId: string; isAdmin: boolean };

export type GiveawayError =
  | {
      error:
        | "feature_off" | "not_found" | "forbidden" | "not_organizer" | "not_approved" | "paused" | "held" | "not_graduated" | "frozen"
        | "monthly_limit" | "closed" | "not_started" | "host" | "not_verified" | "tournament_required" | "age_restricted"
        | "already_entered" | "not_drawn" | "already_drawn" | "too_early" | "bad_state" | "no_replacement" | "expired";
    }
  | { error: "validation_error"; message: string };

const bad = (message: string): GiveawayError => ({ error: "validation_error", message });

// ---------- settings ----------

export async function getGiveawaySettings() {
  const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" }, select: { giveawaysVerifiedOnly: true, giveawayReviewAboveUsd: true, giveawayClaimDays: true } });
  return { verifiedOnly: s?.giveawaysVerifiedOnly ?? false, reviewAboveUsd: s ? num(s.giveawayReviewAboveUsd) : 50, claimDays: s?.giveawayClaimDays ?? 14 };
}

export async function updateGiveawaySettings(input: { adminId: string; verifiedOnly?: unknown; reviewAboveUsd?: unknown; claimDays?: unknown }): Promise<GiveawayError | { data: Awaited<ReturnType<typeof getGiveawaySettings>> }> {
  const data: { giveawaysVerifiedOnly?: boolean; giveawayReviewAboveUsd?: string; giveawayClaimDays?: number } = {};
  if (input.verifiedOnly !== undefined) {
    if (typeof input.verifiedOnly !== "boolean") return bad("Invalid setting.");
    data.giveawaysVerifiedOnly = input.verifiedOnly;
  }
  if (input.reviewAboveUsd !== undefined) {
    const v = Number(input.reviewAboveUsd);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000_000) return bad("The review limit must be 0 or more.");
    data.giveawayReviewAboveUsd = v.toFixed(2);
  }
  if (input.claimDays !== undefined) {
    const v = Number(input.claimDays);
    if (!Number.isInteger(v) || v < 1 || v > 90) return bad("Winners get between 1 and 90 days to send their details.");
    data.giveawayClaimDays = v;
  }
  if (Object.keys(data).length === 0) return bad("Nothing to update.");
  await prisma.$transaction([
    prisma.siteSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data }),
    prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "updated_giveaway_settings", targetType: "SiteSettings", targetId: "singleton", notes: Object.keys(data).join(", ") } }),
  ]);
  return { data: await getGiveawaySettings() };
}

// ---------- who may manage one ----------

type HostFields = { hostType: "platform" | "organizer"; organizerId: string | null };

// Admins can manage any giveaway. An organizer's giveaway is managed by the organization's OWNER only:
// winners' delivery details (addresses, phone numbers) are private.
async function canManage(actor: Actor, g: HostFields): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (g.hostType !== "organizer" || !g.organizerId) return false;
  const org = await prisma.organizerProfile.findUnique({ where: { id: g.organizerId }, select: { userId: true } });
  return org?.userId === actor.userId;
}

// ---------- creating ----------

export type GiveawayInput = {
  title: unknown;
  description: unknown;
  prizeKind: unknown;
  prizeTitle: unknown;
  prizeValueUsd?: unknown;
  prizeImageUrl?: unknown;
  winnersCount: unknown;
  startsAt?: unknown;
  endsAt: unknown;
  tournamentId?: unknown;
  // Admin only:
  sponsorName?: unknown;
  sponsorLogoUrl?: unknown;
  sponsorUrl?: unknown;
  verifiedOnly?: unknown;
  draft?: unknown;
};

function text(v: unknown, min: number, max: number, what: string): string | GiveawayError {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < min || t.length > max) return bad(`${what} must be ${min}–${max} characters.`);
  return t;
}

function optionalUrl(v: unknown, what: string): string | null | GiveawayError {
  if (v === undefined || v === null || v === "") return null;
  const t = typeof v === "string" ? v.trim() : "";
  if (!/^https:\/\/\S+$/.test(t) || t.length > 600) return bad(`${what} must be a link starting with https://`);
  return t;
}

const isErr = (x: unknown): x is GiveawayError => typeof x === "object" && x !== null && "error" in x;

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "giveaway";
}

async function uniqueSlug(title: string) {
  const base = slugify(title);
  let slug = base;
  for (let i = 0; i < 6 && (await prisma.giveaway.findUnique({ where: { slug }, select: { id: true } })); i++) {
    slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return slug;
}

export async function createGiveaway(actor: Actor, host: "platform" | "organizer", input: GiveawayInput): Promise<GiveawayError | { data: { id: string; slug: string; status: string } }> {
  if (!(await getFeatureFlags()).giveaways) return { error: "feature_off" };
  if (host === "platform" && !actor.isAdmin) return { error: "forbidden" };

  const title = text(input.title, 3, 100, "The title");
  if (isErr(title)) return title;
  const description = text(input.description, 10, 3000, "The description");
  if (isErr(description)) return description;
  const prizeTitle = text(input.prizeTitle, 3, 120, "The prize name");
  if (isErr(prizeTitle)) return prizeTitle;
  if (input.prizeKind !== "physical" && input.prizeKind !== "code" && input.prizeKind !== "cash") return bad("Choose what kind of prize it is.");
  const prizeKind = input.prizeKind;
  const winnersCount = Number(input.winnersCount);
  if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > MAX_WINNERS) return bad(`The number of winners must be 1 to ${MAX_WINNERS}.`);

  let prizeValueUsd: number | null = null;
  if (input.prizeValueUsd !== undefined && input.prizeValueUsd !== null && input.prizeValueUsd !== "") {
    prizeValueUsd = Number(input.prizeValueUsd);
    if (!Number.isFinite(prizeValueUsd) || prizeValueUsd < 0 || prizeValueUsd > 10_000_000) return bad("The prize value must be a number of US dollars.");
  }
  if (host === "organizer" && prizeValueUsd === null) return bad("Enter what the prize is worth in US dollars (an estimate is fine).");

  const prizeImageUrl = optionalUrl(input.prizeImageUrl, "The prize photo");
  if (isErr(prizeImageUrl)) return prizeImageUrl;

  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : new Date();
  const endsAt = new Date(String(input.endsAt));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return bad("Enter valid dates.");
  if (endsAt <= new Date()) return bad("The end date must be in the future.");
  if (endsAt <= startsAt) return bad("It must end after it starts.");
  if (endsAt.getTime() - startsAt.getTime() > MAX_DAYS_OPEN * DAY_MS) return bad(`A giveaway can stay open for ${MAX_DAYS_OPEN} days at most.`);

  const settings = await getGiveawaySettings();
  let organizerId: string | null = null;
  let tournamentId: string | null = null;
  let status: "draft" | "pending_review" | "active" = "active";
  let verifiedOnly = settings.verifiedOnly;
  let sponsorName: string | null = null;
  let sponsorLogoUrl: string | null = null;
  let sponsorUrl: string | null = null;

  if (host === "organizer") {
    const org = await prisma.organizerProfile.findUnique({ where: { userId: actor.userId } });
    if (!org) return { error: "not_organizer" };
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { kycStatus: true } });
    if (user?.kycStatus !== "approved") return { error: "not_approved" };
    if ((await getOrganizerPause(org.id)).paused) return { error: "paused" };
    const trust = await getOrganizerTrustSummary(org.id);
    if (trust.holds.length > 0) return { error: "held" };
    // The same bar as lifting the new-organizer limits: a prize is a promise to players.
    if (!trust.graduated) return { error: "not_graduated" };
    if (await isPosterFrozen(actor.userId)) return { error: "frozen" };

    const { limits } = await resolvePlan("organizer", org);
    if (limits.maxGiveawaysPerMonth !== null) {
      const used = await prisma.giveaway.count({ where: { organizerId: org.id, status: { notIn: ["rejected", "cancelled"] }, createdAt: { gte: startOfMonthUtc() } } });
      if (used >= limits.maxGiveawaysPerMonth) return { error: "monthly_limit" };
    }
    organizerId = org.id;
    if (input.tournamentId) {
      const t = await prisma.tournament.findFirst({ where: { id: String(input.tournamentId), organizerId: org.id }, select: { id: true } });
      if (!t) return bad("Pick one of your own tournaments.");
      tournamentId = t.id;
    }
    status = prizeValueUsd !== null && prizeValueUsd > settings.reviewAboveUsd ? "pending_review" : "active";
    // Organizers can't change who may enter: it follows the platform default.
  } else {
    if (input.tournamentId) {
      const t = await prisma.tournament.findUnique({ where: { id: String(input.tournamentId) }, select: { id: true } });
      if (!t) return bad("That tournament doesn't exist.");
      tournamentId = t.id;
    }
    if (typeof input.verifiedOnly === "boolean") verifiedOnly = input.verifiedOnly;
    const sn = input.sponsorName ? text(input.sponsorName, 2, 80, "The sponsor name") : null;
    if (isErr(sn)) return sn;
    const logo = optionalUrl(input.sponsorLogoUrl, "The sponsor logo");
    if (isErr(logo)) return logo;
    const link = optionalUrl(input.sponsorUrl, "The sponsor link");
    if (isErr(link)) return link;
    sponsorName = sn;
    sponsorLogoUrl = logo;
    sponsorUrl = link;
    status = input.draft === true ? "draft" : "active";
  }

  const slug = await uniqueSlug(title);
  const row = await prisma.giveaway.create({
    data: {
      slug, title, description, hostType: host, organizerId, createdById: actor.userId,
      sponsorName, sponsorLogoUrl, sponsorUrl,
      prizeKind, prizeTitle, prizeValueUsd: prizeValueUsd === null ? null : prizeValueUsd.toFixed(2), prizeImageUrl,
      winnersCount, startsAt, endsAt, verifiedOnly, tournamentId, status,
    },
    select: { id: true, slug: true, status: true },
  });
  if (actor.isAdmin) {
    await prisma.adminActionLog.create({
      data: { adminId: actor.userId, action: host === "platform" ? "created_platform_giveaway" : "created_organizer_giveaway", targetType: "Giveaway", targetId: row.id, notes: `${title} · ${status}` },
    });
  }
  return { data: row };
}

// ---------- review and admin controls ----------

export async function reviewGiveaway(input: { adminId: string; id: string; approve: boolean; note?: string }): Promise<GiveawayError | { data: { id: string; status: "active" | "rejected" } }> {
  const note = input.note?.trim() ?? "";
  if (!input.approve && note.length < 3) return bad("Say why you are rejecting it.");
  const g = await prisma.giveaway.findUnique({ where: { id: input.id }, include: { organizer: { select: { userId: true } } } });
  if (!g) return { error: "not_found" };
  if (input.approve && g.endsAt <= new Date()) return bad("This giveaway's end date has already passed, so it can't go live. Ask the organizer to post a new one.");
  const res = await prisma.giveaway.updateMany({
    where: { id: g.id, status: "pending_review" },
    data: { status: input.approve ? "active" : "rejected", reviewNote: note || null, reviewedById: input.adminId, reviewedAt: new Date() },
  });
  if (res.count === 0) return { error: "bad_state" };
  await prisma.adminActionLog.create({ data: { adminId: input.adminId, action: input.approve ? "approved_giveaway" : "rejected_giveaway", targetType: "Giveaway", targetId: g.id, notes: note || null } });
  if (g.organizer) {
    await notify(g.organizer.userId, {
      type: "giveaway",
      title: input.approve ? "Your giveaway is live" : "Your giveaway wasn't approved",
      body: input.approve ? `“${g.title}” was approved and players can enter now.` : `“${g.title}” wasn't approved: ${note}`,
      href: "/organizer/dashboard/giveaways",
    });
  }
  return { data: { id: g.id, status: input.approve ? "active" : "rejected" } };
}

// An admin's draft goes live.
export async function activateGiveaway(input: { adminId: string; id: string }): Promise<GiveawayError | { data: { id: string } }> {
  const g = await prisma.giveaway.findUnique({ where: { id: input.id }, select: { id: true, endsAt: true, title: true } });
  if (!g) return { error: "not_found" };
  if (g.endsAt <= new Date()) return bad("The end date has passed. Create a new giveaway instead.");
  const res = await prisma.giveaway.updateMany({ where: { id: g.id, status: "draft" }, data: { status: "active" } });
  if (res.count === 0) return { error: "bad_state" };
  await prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "activated_giveaway", targetType: "Giveaway", targetId: g.id, notes: g.title } });
  return { data: { id: g.id } };
}

// Only an admin decides who may enter.
export async function setGiveawayVerifiedOnly(input: { adminId: string; id: string; verifiedOnly: unknown }): Promise<GiveawayError | { data: { id: string; verifiedOnly: boolean } }> {
  if (typeof input.verifiedOnly !== "boolean") return bad("Invalid setting.");
  const g = await prisma.giveaway.findUnique({ where: { id: input.id }, select: { id: true, status: true } });
  if (!g) return { error: "not_found" };
  if (g.status === "ended" || g.status === "cancelled" || g.status === "rejected") return { error: "bad_state" };
  await prisma.$transaction([
    prisma.giveaway.update({ where: { id: g.id }, data: { verifiedOnly: input.verifiedOnly } }),
    prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "set_giveaway_verified_only", targetType: "Giveaway", targetId: g.id, notes: String(input.verifiedOnly) } }),
  ]);
  return { data: { id: g.id, verifiedOnly: input.verifiedOnly } };
}

// A host may cancel before the draw; an admin may cancel at any time. People who entered are told.
export async function cancelGiveaway(input: { actor: Actor; id: string; reason: string }): Promise<GiveawayError | { data: { id: string } }> {
  const reason = input.reason.trim();
  if (reason.length < 3) return bad("Say why you are cancelling it.");
  const g = await prisma.giveaway.findUnique({ where: { id: input.id } });
  if (!g) return { error: "not_found" };
  if (!(await canManage(input.actor, g))) return { error: "forbidden" };
  if (g.status === "cancelled" || g.status === "rejected") return { error: "bad_state" };
  if (g.status === "ended" && !input.actor.isAdmin) return { error: "already_drawn" };
  const res = await prisma.giveaway.updateMany({ where: { id: g.id, status: g.status }, data: { status: "cancelled", cancelledNote: reason } });
  if (res.count === 0) return { error: "bad_state" };
  if (input.actor.isAdmin) {
    await prisma.adminActionLog.create({ data: { adminId: input.actor.userId, action: "cancelled_giveaway", targetType: "Giveaway", targetId: g.id, notes: reason } });
  }
  const entrants = await prisma.giveawayEntry.findMany({ where: { giveawayId: g.id }, select: { userId: true } });
  await notifyMany(entrants.map((e) => e.userId), { type: "giveaway", title: "A giveaway you entered was cancelled", body: `“${g.title}” was cancelled: ${reason}`, href: `/giveaways/${g.slug}` });
  return { data: { id: g.id } };
}

// ---------- entering ----------

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: "login" | "closed" | "not_started" | "host" | "not_verified" | "tournament_required" | "age_restricted" | "already_entered" | "unavailable" };

// Everything that decides whether THIS person may enter THIS giveaway, in one place, so the page
// and the entry button can never disagree.
async function checkEligibility(userId: string | null, g: {
  id: string; status: string; startsAt: Date; endsAt: Date; verifiedOnly: boolean; hostType: string; organizerId: string | null; tournamentId: string | null; prizeKind: string;
}, now = new Date()): Promise<Eligibility> {
  if (g.status !== "active") return { ok: false, reason: g.status === "ended" || g.status === "cancelled" ? "closed" : "unavailable" };
  if (g.endsAt <= now) return { ok: false, reason: "closed" };
  if (g.startsAt > now) return { ok: false, reason: "not_started" };
  if (!userId) return { ok: false, reason: "login" };

  const [user, org, member, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, playerProfile: { select: { age: true } } } }),
    g.organizerId ? prisma.organizerProfile.findUnique({ where: { id: g.organizerId }, select: { userId: true } }) : null,
    g.organizerId ? prisma.organizationMember.count({ where: { organizerId: g.organizerId, userId } }) : 0,
    prisma.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId: g.id, userId } }, select: { id: true } }),
  ]);
  if (!user) return { ok: false, reason: "login" };
  if (existing) return { ok: false, reason: "already_entered" };
  // The people running it (and admins, who draw it) can't win it.
  if (user.isAdmin || org?.userId === userId || member > 0) return { ok: false, reason: "host" };
  if (g.verifiedOnly && !(await getVerifiedStatus(userId, now)).verified) return { ok: false, reason: "not_verified" };
  if (g.tournamentId) {
    const took = await prisma.registration.count({
      where: { tournamentId: g.tournamentId, status: "approved", OR: [{ player: { userId } }, { teamEntry: { members: { some: { player: { userId } } } } }] },
    });
    if (took === 0) return { ok: false, reason: "tournament_required" };
  }
  // Cash is for adults, like cash prizes in challenges.
  if (g.prizeKind === "cash" && cashAgeCheck(user.playerProfile?.age) !== "ok") return { ok: false, reason: "age_restricted" };
  return { ok: true };
}

export async function enterGiveaway(userId: string, giveawayId: string): Promise<GiveawayError | { data: { id: string } }> {
  if (!(await getFeatureFlags()).giveaways) return { error: "feature_off" };
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!g) return { error: "not_found" };
  const e = await checkEligibility(userId, g);
  if (!e.ok) {
    const map: Record<string, GiveawayError> = {
      login: { error: "forbidden" }, closed: { error: "closed" }, not_started: { error: "not_started" }, host: { error: "host" },
      not_verified: { error: "not_verified" }, tournament_required: { error: "tournament_required" }, age_restricted: { error: "age_restricted" },
      already_entered: { error: "already_entered" }, unavailable: { error: "not_found" },
    };
    return map[e.reason];
  }
  try {
    await prisma.giveawayEntry.create({ data: { giveawayId, userId } });
  } catch (err) {
    // Two taps at once: the database's unique rule makes the second one a no-op.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "already_entered" };
    throw err;
  }
  return { data: { id: giveawayId } };
}

// ---------- drawing ----------

// n distinct picks, uniformly at random, from a cryptographically secure source.
export function pickRandom<T>(items: T[], n: number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function bannedAmong(userIds: string[], now = new Date()) {
  if (userIds.length === 0) return new Set<string>();
  const bans = await prisma.accountBan.findMany({ where: { userId: { in: userIds }, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { userId: true } });
  return new Set(bans.map((b) => b.userId));
}

export async function drawWinners(input: { actor: Actor; id: string; early?: boolean }): Promise<GiveawayError | { data: { winners: number; entrants: number } }> {
  const g = await prisma.giveaway.findUnique({ where: { id: input.id } });
  if (!g) return { error: "not_found" };
  if (!(await canManage(input.actor, g))) return { error: "forbidden" };
  if (g.status === "ended") return { error: "already_drawn" };
  if (g.status !== "active") return { error: "bad_state" };
  const now = new Date();
  // Only an admin can close a giveaway early.
  if (g.endsAt > now && !(input.early && input.actor.isAdmin)) return { error: "too_early" };

  const { claimDays } = await getGiveawaySettings();
  const result = await prisma.$transaction(async (tx) => {
    // Only the first draw wins: a double click or two admins can't draw twice.
    const claimed = await tx.giveaway.updateMany({ where: { id: g.id, status: "active" }, data: { status: "ended", drawnAt: now, drawnById: input.actor.userId } });
    if (claimed.count === 0) return null;
    const entries = await tx.giveawayEntry.findMany({ where: { giveawayId: g.id }, select: { userId: true } });
    const banned = await bannedAmong(entries.map((e) => e.userId), now);
    const pool = entries.map((e) => e.userId).filter((u) => !banned.has(u));
    const chosen = pickRandom(pool, g.winnersCount);
    if (chosen.length > 0) {
      await tx.giveawayWinner.createMany({ data: chosen.map((userId) => ({ giveawayId: g.id, userId, claimDeadline: new Date(now.getTime() + claimDays * DAY_MS) })) });
    }
    if (input.actor.isAdmin) {
      await tx.adminActionLog.create({ data: { adminId: input.actor.userId, action: "drew_giveaway", targetType: "Giveaway", targetId: g.id, notes: `${chosen.length} winner(s) of ${entries.length} entries${g.endsAt > now ? " (closed early)" : ""}` } });
    }
    return { chosen, entrants: entries.length };
  });
  if (!result) return { error: "already_drawn" };

  await notifyMany(result.chosen, {
    type: "giveaway",
    title: "You won a giveaway!",
    body: `You won “${g.prizeTitle}” in “${g.title}”. Send your delivery details within ${claimDays} days to claim it.`,
    href: `/giveaways/${g.slug}`,
  });
  if (g.organizerId) {
    const org = await prisma.organizerProfile.findUnique({ where: { id: g.organizerId }, select: { userId: true } });
    if (org && org.userId !== input.actor.userId) {
      await notify(org.userId, { type: "giveaway", title: "Your giveaway was drawn", body: `“${g.title}” has ${result.chosen.length} winner${result.chosen.length === 1 ? "" : "s"}. Winners will send their delivery details.`, href: "/organizer/dashboard/giveaways" });
    }
  }
  return { data: { winners: result.chosen.length, entrants: result.entrants } };
}

// Replace a winner with a new random draw from the people left. The host can do it once the
// winner's time to answer is up and they sent nothing; an admin can do it any time before delivery.
export async function replaceWinner(input: { actor: Actor; winnerId: string; reason: string }): Promise<GiveawayError | { data: { replacement: string | null } }> {
  const reason = input.reason.trim();
  if (reason.length < 3) return bad("Say why the winner is being replaced.");
  const w = await prisma.giveawayWinner.findUnique({ where: { id: input.winnerId }, include: { giveaway: true } });
  if (!w) return { error: "not_found" };
  const g = w.giveaway;
  if (!(await canManage(input.actor, g))) return { error: "forbidden" };
  if (w.status === "replaced" || w.status === "confirmed" || w.status === "delivered") return { error: "bad_state" };
  const now = new Date();
  if (!input.actor.isAdmin && !(w.status === "awaiting_details" && w.claimDeadline <= now)) return { error: "too_early" };

  const { claimDays } = await getGiveawaySettings();
  const out = await prisma.$transaction(async (tx) => {
    const res = await tx.giveawayWinner.updateMany({ where: { id: w.id, status: w.status }, data: { status: "replaced", replacedNote: reason } });
    if (res.count === 0) return null;
    const [entries, everWon] = await Promise.all([
      tx.giveawayEntry.findMany({ where: { giveawayId: g.id }, select: { userId: true } }),
      tx.giveawayWinner.findMany({ where: { giveawayId: g.id }, select: { userId: true } }),
    ]);
    const taken = new Set(everWon.map((x) => x.userId));
    const banned = await bannedAmong(entries.map((e) => e.userId), now);
    const pool = entries.map((e) => e.userId).filter((u) => !taken.has(u) && !banned.has(u));
    const [pick] = pickRandom(pool, 1);
    if (pick) await tx.giveawayWinner.create({ data: { giveawayId: g.id, userId: pick, claimDeadline: new Date(now.getTime() + claimDays * DAY_MS) } });
    if (input.actor.isAdmin) await tx.adminActionLog.create({ data: { adminId: input.actor.userId, action: "replaced_giveaway_winner", targetType: "Giveaway", targetId: g.id, notes: reason } });
    return { replacement: pick ?? null };
  });
  if (!out) return { error: "bad_state" };

  await notify(w.userId, { type: "giveaway", title: "Your giveaway prize was given to someone else", body: `“${g.title}”: ${reason}`, href: `/giveaways/${g.slug}` });
  if (out.replacement) {
    await notify(out.replacement, { type: "giveaway", title: "You won a giveaway!", body: `You won “${g.prizeTitle}” in “${g.title}”. Send your delivery details within ${claimDays} days to claim it.`, href: `/giveaways/${g.slug}` });
  }
  return { data: out };
}

// ---------- the winner's side ----------

export type DeliveryInput = { name: unknown; phone: unknown; address?: unknown; note?: unknown };

export async function submitWinnerDetails(input: { userId: string; winnerId: string; details: DeliveryInput }): Promise<GiveawayError | { data: { id: string } }> {
  const w = await prisma.giveawayWinner.findUnique({ where: { id: input.winnerId }, include: { giveaway: { select: { prizeKind: true, title: true, organizerId: true, slug: true } } } });
  if (!w || w.userId !== input.userId) return { error: "not_found" };
  if (w.status !== "awaiting_details" && w.status !== "details_submitted") return { error: "bad_state" };
  if (w.claimDeadline <= new Date()) return { error: "expired" };

  const name = text(input.details.name, 2, 100, "Your name");
  if (isErr(name)) return name;
  const phone = text(input.details.phone, 6, 30, "Your phone number");
  if (isErr(phone)) return phone;
  const physical = w.giveaway.prizeKind === "physical";
  const address = physical ? text(input.details.address, 10, 300, "Your full delivery address") : null;
  if (isErr(address)) return address;
  const noteRaw = typeof input.details.note === "string" ? input.details.note.trim() : "";
  if (noteRaw.length > 300) return bad("Keep the note under 300 characters.");
  // A cash or code prize needs to know where to send it.
  if (!physical && noteRaw.length < 3) return bad(w.giveaway.prizeKind === "cash" ? "Tell the host how to pay you (a bank, JazzCash or Easypaisa account)." : "Tell the host where to send the code (an email address works).");

  await prisma.giveawayWinner.update({ where: { id: w.id }, data: { status: "details_submitted", deliveryName: name, deliveryPhone: phone, deliveryAddress: address, deliveryNote: noteRaw || null } });
  if (w.giveaway.organizerId) {
    const org = await prisma.organizerProfile.findUnique({ where: { id: w.giveaway.organizerId }, select: { userId: true } });
    if (org) await notify(org.userId, { type: "giveaway", title: "A winner sent their delivery details", body: `“${w.giveaway.title}”: you can deliver the prize now.`, href: "/organizer/dashboard/giveaways" });
  }
  return { data: { id: w.id } };
}

export async function markDelivered(input: { actor: Actor; winnerId: string; note: string }): Promise<GiveawayError | { data: { id: string } }> {
  const note = input.note.trim();
  if (note.length < 3 || note.length > 500) return bad("Add a delivery note (a tracking number, or how and when it was sent), 3–500 characters.");
  const w = await prisma.giveawayWinner.findUnique({ where: { id: input.winnerId }, include: { giveaway: true } });
  if (!w) return { error: "not_found" };
  if (!(await canManage(input.actor, w.giveaway))) return { error: "forbidden" };
  // After a dispute the host can deliver again.
  if (w.status !== "details_submitted" && w.status !== "disputed") return { error: "bad_state" };
  await prisma.giveawayWinner.update({ where: { id: w.id }, data: { status: "delivered", hostNote: note, deliveredAt: new Date(), disputeNote: null } });
  if (input.actor.isAdmin) await prisma.adminActionLog.create({ data: { adminId: input.actor.userId, action: "marked_giveaway_delivered", targetType: "Giveaway", targetId: w.giveawayId, notes: note } });
  await notify(w.userId, { type: "giveaway", title: "Your giveaway prize was sent", body: `“${w.giveaway.title}”: ${note}. Please confirm when you receive it.`, href: `/giveaways/${w.giveaway.slug}` });
  return { data: { id: w.id } };
}

export async function confirmReceived(input: { userId: string; winnerId: string }): Promise<GiveawayError | { data: { id: string } }> {
  const w = await prisma.giveawayWinner.findUnique({ where: { id: input.winnerId }, select: { id: true, userId: true, status: true } });
  if (!w || w.userId !== input.userId) return { error: "not_found" };
  const res = await prisma.giveawayWinner.updateMany({ where: { id: w.id, status: { in: ["delivered", "disputed"] } }, data: { status: "confirmed", confirmedAt: new Date() } });
  if (res.count === 0) return { error: "bad_state" };
  return { data: { id: w.id } };
}

export async function disputeDelivery(input: { userId: string; winnerId: string; note: string }): Promise<GiveawayError | { data: { id: string } }> {
  const note = input.note.trim();
  if (note.length < 10 || note.length > 500) return bad("Tell us what happened (10–500 characters).");
  const w = await prisma.giveawayWinner.findUnique({ where: { id: input.winnerId }, include: { giveaway: { select: { title: true, organizerId: true } } } });
  if (!w || w.userId !== input.userId) return { error: "not_found" };
  const res = await prisma.giveawayWinner.updateMany({ where: { id: w.id, status: "delivered" }, data: { status: "disputed", disputeNote: note } });
  if (res.count === 0) return { error: "bad_state" };
  if (w.giveaway.organizerId) {
    const org = await prisma.organizerProfile.findUnique({ where: { id: w.giveaway.organizerId }, select: { userId: true } });
    if (org) await notify(org.userId, { type: "giveaway", title: "A winner says they didn't get their prize", body: `“${w.giveaway.title}”: ${note}`, href: "/organizer/dashboard/giveaways" });
  }
  return { data: { id: w.id } };
}

// ---------- reading ----------

export type Phase = "draft" | "pending_review" | "rejected" | "cancelled" | "upcoming" | "open" | "closed" | "drawn";

export function phaseOf(g: { status: string; startsAt: Date; endsAt: Date }, now = new Date()): Phase {
  if (g.status === "ended") return "drawn";
  if (g.status !== "active") return g.status as Phase;
  if (g.startsAt > now) return "upcoming";
  return g.endsAt <= now ? "closed" : "open";
}

type HostView = { kind: "platform" | "organizer"; name: string; sponsor: { name: string; logoUrl: string | null; url: string | null } | null };

function hostOf(g: { hostType: string; sponsorName: string | null; sponsorLogoUrl: string | null; sponsorUrl: string | null; organizer?: { orgName: string } | null }): HostView {
  return {
    kind: g.hostType === "organizer" ? "organizer" : "platform",
    name: g.hostType === "organizer" ? (g.organizer?.orgName ?? "An organizer") : "BattleKrypt",
    sponsor: g.sponsorName ? { name: g.sponsorName, logoUrl: g.sponsorLogoUrl, url: g.sponsorUrl } : null,
  };
}

function cardOf(g: {
  id: string; slug: string; title: string; prizeKind: string; prizeTitle: string; prizeValueUsd: Prisma.Decimal | null; prizeImageUrl: string | null;
  winnersCount: number; startsAt: Date; endsAt: Date; verifiedOnly: boolean; status: string; hostType: string;
  sponsorName: string | null; sponsorLogoUrl: string | null; sponsorUrl: string | null; organizer?: { orgName: string } | null; _count: { entries: number };
}, entered: boolean, now: Date) {
  return {
    id: g.id, slug: g.slug, title: g.title, prizeKind: g.prizeKind, prizeTitle: g.prizeTitle, prizeImageUrl: g.prizeImageUrl,
    prizeValueUsd: g.prizeValueUsd === null ? null : num(g.prizeValueUsd), winnersCount: g.winnersCount,
    startsAt: g.startsAt.toISOString(), endsAt: g.endsAt.toISOString(), verifiedOnly: g.verifiedOnly,
    phase: phaseOf(g, now), host: hostOf(g), entries: g._count.entries, entered,
  };
}
export type GiveawayCard = ReturnType<typeof cardOf>;

export async function listPublicGiveaways(viewerId: string | null) {
  const now = new Date();
  const rows = await prisma.giveaway.findMany({
    where: { OR: [{ status: "active" }, { status: "ended", drawnAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } }] },
    orderBy: { endsAt: "asc" },
    take: 80,
    include: { organizer: { select: { orgName: true } }, _count: { select: { entries: true } } },
  });
  const mine = viewerId ? new Set((await prisma.giveawayEntry.findMany({ where: { userId: viewerId, giveawayId: { in: rows.map((r) => r.id) } }, select: { giveawayId: true } })).map((e) => e.giveawayId)) : new Set<string>();
  const cards = rows.map((g) => cardOf(g, mine.has(g.id), now));
  return { live: cards.filter((c) => c.phase !== "drawn"), drawn: cards.filter((c) => c.phase === "drawn").reverse() };
}

export async function getGiveawayPage(slug: string, viewer: { id: string; isAdmin: boolean } | null) {
  const now = new Date();
  const g = await prisma.giveaway.findUnique({
    where: { slug },
    include: {
      organizer: { select: { orgName: true } },
      tournament: { select: { name: true, slug: true } },
      _count: { select: { entries: true } },
      winners: { where: { status: { not: "replaced" } }, select: { id: true, status: true, userId: true, user: { select: { displayName: true } } } },
    },
  });
  if (!g) return null;
  const manage = viewer ? await canManage({ userId: viewer.id, isAdmin: viewer.isAdmin }, g) : false;
  // Drafts, giveaways waiting for review and rejected ones are only visible to the people running them.
  if ((g.status === "draft" || g.status === "pending_review" || g.status === "rejected") && !manage) return null;

  const eligibility = await checkEligibility(viewer?.id ?? null, g, now);
  const mine = viewer ? await prisma.giveawayWinner.findFirst({ where: { giveawayId: g.id, userId: viewer.id }, orderBy: { createdAt: "desc" } }) : null;
  const entered = viewer ? Boolean(await prisma.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId: g.id, userId: viewer.id } }, select: { id: true } })) : false;

  return {
    ...cardOf(g, entered, now),
    description: g.description,
    status: g.status,
    reviewNote: manage ? g.reviewNote : null,
    cancelledNote: g.cancelledNote,
    tournament: g.tournament,
    drawnAt: g.drawnAt?.toISOString() ?? null,
    manage,
    eligibility,
    winners: g.winners.map((w) => ({ id: w.id, name: w.user.displayName, delivered: w.status === "confirmed" })),
    myWin: mine
      ? {
          id: mine.id, status: mine.status, claimDeadline: mine.claimDeadline.toISOString(),
          deliveryName: mine.deliveryName, deliveryPhone: mine.deliveryPhone, deliveryAddress: mine.deliveryAddress, deliveryNote: mine.deliveryNote,
          hostNote: mine.hostNote, replacedNote: mine.replacedNote, prizeKind: g.prizeKind,
        }
      : null,
  };
}
export type GiveawayPage = NonNullable<Awaited<ReturnType<typeof getGiveawayPage>>>;

// What a host or an admin sees: every winner with the delivery details they sent.
function managedOf(g: Prisma.GiveawayGetPayload<{ include: { organizer: { select: { orgName: true } }; tournament: { select: { name: true } }; _count: { select: { entries: true } }; winners: { include: { user: { select: { displayName: true; email: true } } } } } }>, now: Date) {
  return {
    id: g.id, slug: g.slug, title: g.title, status: g.status, phase: phaseOf(g, now), host: hostOf(g),
    prizeKind: g.prizeKind, prizeTitle: g.prizeTitle, prizeValueUsd: g.prizeValueUsd === null ? null : num(g.prizeValueUsd),
    winnersCount: g.winnersCount, startsAt: g.startsAt.toISOString(), endsAt: g.endsAt.toISOString(), verifiedOnly: g.verifiedOnly,
    tournament: g.tournament?.name ?? null, entries: g._count.entries, reviewNote: g.reviewNote, cancelledNote: g.cancelledNote,
    winners: g.winners.map((w) => ({
      id: w.id, name: w.user.displayName, email: w.user.email ?? "", status: w.status, claimDeadline: w.claimDeadline.toISOString(),
      deliveryName: w.deliveryName, deliveryPhone: w.deliveryPhone, deliveryAddress: w.deliveryAddress, deliveryNote: w.deliveryNote,
      hostNote: w.hostNote, disputeNote: w.disputeNote, replacedNote: w.replacedNote,
    })),
  };
}
export type ManagedGiveaway = ReturnType<typeof managedOf>;

const MANAGE_INCLUDE = {
  organizer: { select: { orgName: true } },
  tournament: { select: { name: true } },
  _count: { select: { entries: true } },
  winners: { orderBy: { createdAt: "asc" as const }, include: { user: { select: { displayName: true, email: true } } } },
};

export async function listGiveawaysForOrganizer(organizerId: string): Promise<ManagedGiveaway[]> {
  const now = new Date();
  const rows = await prisma.giveaway.findMany({ where: { organizerId }, orderBy: { createdAt: "desc" }, take: 50, include: MANAGE_INCLUDE });
  return rows.map((g) => managedOf(g, now));
}

export async function listGiveawaysForAdmin(): Promise<ManagedGiveaway[]> {
  const now = new Date();
  const rows = await prisma.giveaway.findMany({ orderBy: [{ createdAt: "desc" }], take: 60, include: MANAGE_INCLUDE });
  const order: Record<string, number> = { pending_review: 0, draft: 1, active: 2, ended: 3, cancelled: 4, rejected: 5 };
  return rows.map((g) => managedOf(g, now)).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}

// Giveaways this person won and still has something to do about (or can see the result of).
export async function listMyWinnings(userId: string) {
  const rows = await prisma.giveawayWinner.findMany({
    where: { userId, status: { not: "replaced" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { giveaway: { select: { slug: true, title: true, prizeTitle: true } } },
  });
  return rows.map((w) => ({ id: w.id, status: w.status, claimDeadline: w.claimDeadline.toISOString(), slug: w.giveaway.slug, title: w.giveaway.title, prizeTitle: w.giveaway.prizeTitle }));
}

// The numbers on an organization's admin page.
export async function getGiveawayStatsFor(organizerId: string) {
  const [rows, winners, entries] = await Promise.all([
    prisma.giveaway.findMany({ where: { organizerId }, orderBy: { createdAt: "desc" }, select: { id: true, slug: true, title: true, status: true, createdAt: true, _count: { select: { entries: true } } } }),
    prisma.giveawayWinner.groupBy({ by: ["status"], where: { giveaway: { organizerId } }, _count: true }),
    prisma.giveawayEntry.count({ where: { giveaway: { organizerId } } }),
  ]);
  const w = (s: string) => winners.find((x) => x.status === s)?._count ?? 0;
  const counted = winners.filter((x) => x.status !== "replaced").reduce((n, x) => n + x._count, 0);
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return {
    total: rows.length, byStatus, entries, winners: counted, confirmed: w("confirmed"), disputed: w("disputed"), awaiting: w("awaiting_details") + w("details_submitted") + w("delivered"),
    confirmationRate: counted > 0 ? Math.round((w("confirmed") / counted) * 100) : null,
    recent: rows.slice(0, 5).map((r) => ({ id: r.id, slug: r.slug, title: r.title, status: r.status, entries: r._count.entries, at: r.createdAt.toISOString() })),
  };
}

// For the organizer's page: this month's allowance, and anything that would stop a new giveaway
// (the same checks createGiveaway makes, so the page never promises what the API will refuse).
export async function getOrganizerGiveawayStatus(organizerId: string) {
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
  if (!org) return null;
  const user = await prisma.user.findUnique({ where: { id: org.userId }, select: { kycStatus: true } });
  const [pause, trust, frozen, plan, settings, flags] = await Promise.all([
    getOrganizerPause(org.id), getOrganizerTrustSummary(org.id), isPosterFrozen(org.userId), resolvePlan("organizer", org), getGiveawaySettings(), getFeatureFlags(),
  ]);
  const limit = plan.limits.maxGiveawaysPerMonth;
  const used = await prisma.giveaway.count({ where: { organizerId: org.id, status: { notIn: ["rejected", "cancelled"] }, createdAt: { gte: startOfMonthUtc() } } });
  const blockers: GiveawayError["error"][] = [];
  if (!flags.giveaways) blockers.push("feature_off");
  if (user?.kycStatus !== "approved") blockers.push("not_approved");
  if (pause.paused) blockers.push("paused");
  if (trust.holds.length > 0) blockers.push("held");
  if (!trust.graduated) blockers.push("not_graduated");
  if (frozen) blockers.push("frozen");
  if (limit !== null && used >= limit) blockers.push("monthly_limit");
  return { planName: plan.name, limit, used, blockers, reviewAboveUsd: settings.reviewAboveUsd, defaultVerifiedOnly: settings.verifiedOnly };
}
