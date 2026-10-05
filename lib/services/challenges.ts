// Challenges: a poster (player, club or organization) offers a prize to
// whoever completes a task. Part 1 covers posting, plan limits and the admin
// review of very large prizes; applications, proof and payment disputes
// come next.
//
// Guardrail (spec §7): challenges are separate from tournaments. Nothing here
// touches ratings, tier eligibility or tournament registration.

import { prisma } from "@/lib/prisma";
import { resolvePlan, type EffectivePlan } from "@/lib/plans";
import { tryToUsd } from "@/lib/currency-fx";
import { startOfMonthUtc } from "@/lib/services/plan-gates";
import type { ChallengeInput, ChallengeFieldErrors, PosterType } from "@/lib/validation/challenge";
import { PICK_GRACE_DAYS } from "@/lib/challenge-rules";
import { notifyMany } from "@/lib/services/notifications";
import { frozenPosterIds, isPosterFrozen, sweepFulfillment } from "@/lib/services/challenge-fulfillment";

const DAY = 86_400_000;

// ------------------------------------------------------------
// Who can post as what, and what their plan allows
// ------------------------------------------------------------

export interface PosterRole {
  type: PosterType;
  name: string;
  planName: string;
  isPaid: boolean;
  used: number; // challenges posted this month
  monthlyLimit: number | null; // null = unlimited
  prizeCapUsd: number | null; // null = no cap
}

type ResolvedRole = PosterRole & { plan: EffectivePlan };

async function roleFor(userId: string, type: PosterType): Promise<ResolvedRole | null> {
  let name: string;
  let plan: EffectivePlan;

  if (type === "organizer") {
    const org = await prisma.organizerProfile.findUnique({ where: { userId } });
    if (!org) return null;
    name = org.orgName;
    plan = await resolvePlan("organizer", org);
  } else if (type === "club") {
    const club = await prisma.clubProfile.findUnique({ where: { userId } });
    if (!club || club.status !== "approved") return null;
    name = club.clubName;
    plan = await resolvePlan("club", { planCode: club.subscriptionPlanCode, planExpiresAt: club.planExpiresAt });
  } else {
    const [player, user] = await Promise.all([
      prisma.playerProfile.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    ]);
    if (!player || !user) return null;
    name = user.displayName;
    plan = await resolvePlan("player", player);
  }

  const limits = plan.limits as { maxChallengesPerMonth: number | null; maxChallengePrizeUsd: number | null };
  const used = await prisma.challenge.count({
    where: {
      posterUserId: userId,
      posterType: type,
      status: { not: "rejected" },
      createdAt: { gte: startOfMonthUtc() },
    },
  });

  return {
    type,
    name,
    planName: plan.name,
    isPaid: plan.isPaid,
    used,
    monthlyLimit: limits.maxChallengesPerMonth,
    prizeCapUsd: limits.maxChallengePrizeUsd,
    plan,
  };
}

// Every role this account can post as, with its current allowance.
export async function getPosterRoles(userId: string): Promise<PosterRole[]> {
  const roles = await Promise.all((["player", "club", "organizer"] as const).map((t) => roleFor(userId, t)));
  return roles
    .filter((r): r is ResolvedRole => r !== null)
    .map((r) => ({
      type: r.type,
      name: r.name,
      planName: r.planName,
      isPaid: r.isPaid,
      used: r.used,
      monthlyLimit: r.monthlyLimit,
      prizeCapUsd: r.prizeCapUsd,
    }));
}

// Can this account APPLY to challenges? Needs a paid plan that allows it, as
// a player (solo) or through its club (team). Free accounts can still view.
export async function getJoinAccess(userId: string) {
  const [player, club] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId } }),
    prisma.clubProfile.findUnique({ where: { userId } }),
  ]);
  const [playerPlan, clubPlan] = await Promise.all([
    player ? resolvePlan("player", player) : null,
    club && club.status === "approved"
      ? resolvePlan("club", { planCode: club.subscriptionPlanCode, planExpiresAt: club.planExpiresAt })
      : null,
  ]);
  const asPlayer = !!playerPlan?.limits.canJoinChallenges;
  const asTeam = !!clubPlan?.limits.canJoinChallenges;
  return { asPlayer, asTeam, canJoin: asPlayer || asTeam };
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

export async function getChallengeReviewUsd(): Promise<number> {
  const s = await prisma.siteSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  return Number(s.challengeReviewUsd.toString());
}

export async function setChallengeReviewUsd(adminId: string, usd: number) {
  if (!Number.isFinite(usd) || usd < 1 || usd > 1_000_000_000) return { error: "invalid_amount" as const };
  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: { challengeReviewUsd: usd.toFixed(2) },
    create: { id: "singleton", challengeReviewUsd: usd.toFixed(2) },
  });
  await prisma.adminActionLog.create({
    data: { adminId, action: "set_challenge_review_threshold", targetType: "SiteSettings", targetId: "singleton", notes: `$${usd}` },
  });
  return { data: { usd } };
}

// ------------------------------------------------------------
// Posting
// ------------------------------------------------------------

export type CreateResult =
  | { data: { id: string; status: "open" | "pending_review" } }
  | { error: "role_unavailable" | "challenge_limit" | "prize_cap" | "fx_unavailable" | "game_not_found" | "poster_frozen"; message: string }
  | { error: "validation_error"; message: string; fields: ChallengeFieldErrors };

export async function createChallenge(userId: string, input: ChallengeInput): Promise<CreateResult> {
  const role = await roleFor(userId, input.postAs);
  if (!role) {
    return { error: "role_unavailable", message: "You can't post as that account type." };
  }
  if (await isPosterFrozen(userId)) {
    return { error: "poster_frozen", message: "You can't post challenges while a payment dispute against you is unresolved." };
  }

  // 1. Monthly count, from the plan.
  if (role.monthlyLimit !== null && role.used >= role.monthlyLimit) {
    return {
      error: "challenge_limit",
      message: `Your ${role.planName} plan allows ${role.monthlyLimit} challenge${role.monthlyLimit === 1 ? "" : "s"} per month. Upgrade to post more.`,
    };
  }

  const game = await prisma.game.findFirst({ where: { id: input.gameId, isApproved: true } });
  if (!game) return { error: "game_not_found", message: "Choose one of the listed games." };

  // 2. Prize size in USD — converted for cash, the poster's estimate for
  //    in-game prizes, nothing for plain rewards.
  let prizeUsd: number | null = null;
  if (input.prizeType === "cash") {
    const fx = await tryToUsd(input.cashAmount as number, input.cashCurrency as string);
    if ("error" in fx) {
      return { error: "fx_unavailable", message: "Couldn't check the exchange rate right now. Please try again in a moment." };
    }
    prizeUsd = Math.round(fx.usd * 100) / 100;
  } else if (input.prizeType === "in_game") {
    prizeUsd = input.prizeEstimatedUsd;
  }

  if (prizeUsd !== null && role.prizeCapUsd !== null && prizeUsd > role.prizeCapUsd) {
    return {
      error: "prize_cap",
      message: `Your ${role.planName} plan allows prizes up to $${role.prizeCapUsd}. This one is about $${prizeUsd.toFixed(2)}. Lower the prize or upgrade your plan.`,
    };
  }

  // 3. Very large prizes wait for an admin before going live.
  const threshold = await getChallengeReviewUsd();
  const needsReview = prizeUsd !== null && prizeUsd > threshold;

  const challenge = await prisma.challenge.create({
    data: {
      posterUserId: userId,
      posterType: input.postAs,
      posterName: role.name,
      title: input.title,
      description: input.description,
      gameId: input.gameId,
      entrantType: input.entrantType,
      minRating: input.minRating,
      slots: input.slots,
      maxApplicants: input.maxApplicants,
      applicationsCloseAt: new Date(Date.now() + input.openDays * DAY),
      completeWithinDays: input.completeWithinDays,
      prizeType: input.prizeType,
      prizeDescription: input.prizeDescription,
      cashAmount: input.cashAmount === null ? null : input.cashAmount.toFixed(2),
      cashCurrency: input.cashCurrency,
      prizeUsd: prizeUsd === null ? null : prizeUsd.toFixed(2),
      payoutMethod: input.payoutMethod,
      status: needsReview ? "pending_review" : "open",
    },
  });
  return { data: { id: challenge.id, status: challenge.status as "open" | "pending_review" } };
}

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------

// Open challenges whose applications have closed expire when nobody applied,
// or when the poster hasn't picked within PICK_GRACE_DAYS. Done on read, so
// no scheduled job is needed for this one.
export async function expireStaleChallenges() {
  // Also moves proof / payment / dispute deadlines along. A failure here must
  // never break the page being read.
  try {
    await sweepFulfillment();
  } catch (e) {
    console.error("fulfillment sweep failed", e);
  }
  const now = new Date();
  const stale = await prisma.challenge.findMany({
    where: {
      status: "open",
      OR: [
        { applicationsCloseAt: { lt: now }, applications: { none: { status: "applied" } } },
        { applicationsCloseAt: { lt: new Date(now.getTime() - PICK_GRACE_DAYS * DAY) } },
      ],
    },
    select: { id: true, title: true, applications: { where: { status: "applied" }, select: { applicantUserId: true } } },
  });
  if (stale.length === 0) return;

  const ids = stale.map((c) => c.id);
  // Only the rows we just read are touched, and only if still open, so a poster
  // confirming a pick at the same moment can't be overwritten.
  const expired = await prisma.$transaction(async (tx) => {
    const { count } = await tx.challenge.updateMany({ where: { id: { in: ids }, status: "open" }, data: { status: "expired" } });
    if (count === 0) return [] as string[];
    const done = await tx.challenge.findMany({ where: { id: { in: ids }, status: "expired" }, select: { id: true } });
    const doneIds = done.map((d) => d.id);
    // Applicants nobody picked in time are turned down, not left waiting.
    await tx.challengeApplication.updateMany({
      where: { challengeId: { in: doneIds }, status: "applied" },
      data: { status: "not_selected", decidedAt: now },
    });
    return doneIds;
  });

  for (const c of stale.filter((c) => expired.includes(c.id))) {
    await notifyMany(c.applications.map((a) => a.applicantUserId), {
      type: "challenge_expired",
      title: `Challenge closed: ${c.title}`,
      body: "The poster didn't pick anyone in time.",
      href: `/challenges/${c.id}`,
    });
  }
}

export async function listOpenChallenges(opts: { gameId?: string } = {}) {
  await expireStaleChallenges();
  // Posters with an unsettled payment dispute are paused: hidden until it's settled.
  const frozen = await frozenPosterIds();
  return prisma.challenge.findMany({
    // Only challenges still taking applications are listed; one waiting for
    // its poster to pick stays reachable from the poster's own pages.
    where: {
      status: "open",
      applicationsCloseAt: { gt: new Date() },
      ...(frozen.length > 0 && { posterUserId: { notIn: frozen } }),
      ...(opts.gameId && { gameId: opts.gameId }),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      game: { select: { name: true } },
      _count: { select: { applications: { where: { status: "applied" } } } },
    },
  });
}

export async function listMyChallenges(userId: string) {
  await expireStaleChallenges();
  return prisma.challenge.findMany({
    where: { posterUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      game: { select: { name: true } },
      _count: { select: { applications: { where: { status: "applied" } } } },
    },
  });
}

const PUBLIC_STATUSES = ["open", "in_progress", "completed"];

// null when it doesn't exist or the viewer isn't allowed to see it
// (held / rejected / cancelled / expired challenges are poster- and admin-only).
export async function getChallengeForViewer(id: string, viewer: { id: string; isAdmin: boolean } | null) {
  await expireStaleChallenges();
  const c = await prisma.challenge.findUnique({ where: { id }, include: { game: { select: { name: true } } } });
  if (!c) return null;
  const isPoster = viewer?.id === c.posterUserId;
  if (!PUBLIC_STATUSES.includes(c.status) && !isPoster && !viewer?.isAdmin) return null;
  return { challenge: c, isPoster };
}

export async function cancelChallenge(userId: string, id: string) {
  const c = await prisma.challenge.findUnique({ where: { id } });
  if (!c || c.posterUserId !== userId) return { error: "not_found" as const };
  // Cancelling after challengers were picked goes through the dispute rules
  // instead (next part), so only open / held challenges can be cancelled here.
  if (c.status !== "open" && c.status !== "pending_review") return { error: "not_cancellable" as const };

  const waiting = await prisma.challengeApplication.findMany({
    where: { challengeId: id, status: "applied" },
    select: { applicantUserId: true },
  });
  await prisma.$transaction([
    prisma.challenge.update({ where: { id }, data: { status: "cancelled" } }),
    prisma.challengeApplication.updateMany({
      where: { challengeId: id, status: "applied" },
      data: { status: "not_selected", decidedAt: new Date() },
    }),
  ]);
  await notifyMany(waiting.map((w) => w.applicantUserId), {
    type: "challenge_cancelled",
    title: `Challenge cancelled: ${c.title}`,
    href: `/challenges/${id}`,
  });
  return { data: { id } };
}

// ------------------------------------------------------------
// Admin review of large prizes
// ------------------------------------------------------------

export async function listChallengesAwaitingReview() {
  return prisma.challenge.findMany({
    where: { status: "pending_review" },
    orderBy: { createdAt: "asc" },
    include: {
      game: { select: { name: true } },
      poster: { select: { email: true, displayName: true } },
    },
  });
}

export async function approveChallenge(id: string, adminId: string) {
  const c = await prisma.challenge.findUnique({ where: { id } });
  if (!c) return { error: "not_found" as const };
  if (c.status !== "pending_review") return { error: "not_pending" as const };

  // The application window starts when it goes live, not when it was posted.
  const originalWindow = c.applicationsCloseAt.getTime() - c.createdAt.getTime();
  await prisma.$transaction([
    prisma.challenge.update({
      where: { id },
      data: {
        status: "open",
        reviewedById: adminId,
        reviewedAt: new Date(),
        applicationsCloseAt: new Date(Date.now() + originalWindow),
      },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: "approved_challenge", targetType: "Challenge", targetId: id },
    }),
  ]);
  return { data: { id } };
}

export async function rejectChallenge(id: string, adminId: string, note: string) {
  const reason = note.trim();
  if (!reason) return { error: "note_required" as const };
  const c = await prisma.challenge.findUnique({ where: { id } });
  if (!c) return { error: "not_found" as const };
  if (c.status !== "pending_review") return { error: "not_pending" as const };

  await prisma.$transaction([
    prisma.challenge.update({
      where: { id },
      data: { status: "rejected", reviewNote: reason, reviewedById: adminId, reviewedAt: new Date() },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: "rejected_challenge", targetType: "Challenge", targetId: id, notes: reason },
    }),
  ]);
  return { data: { id } };
}
