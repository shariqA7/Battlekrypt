// Organizer trust (anti-scam) rules. Two mechanisms:
//
//  1. STARTER LIMITS — a new organizer's paid/prized events are capped (entry
//     fee, prize pool, number of paid entrants). They lift automatically once
//     the organizer has completed `graduationEvents` prize tournaments whose
//     winners ALL confirmed they were paid, or when an admin lifts them.
//
//  2. PAYOUT HOLD — an organizer with a completed prize tournament whose
//     payout was never marked as sent (after the grace period), or that a
//     winner disputed, can't create or publish new paid/prized events until
//     it's settled.
//
// Entry fees and prizes are paid directly between people; the platform only
// records the organizer's claim ("I paid") and each winner's answer. Every
// number comes from OrganizerTrustConfig (admin-editable), not constants.
import { prisma } from "@/lib/prisma";
import { tryToUsd } from "@/lib/currency-fx";
import { notify, notifyMany } from "@/lib/services/notifications";
import { isIdentityVerified } from "@/lib/identity";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { getOrganizerPause } from "@/lib/services/organizer-reports";

const DAY_MS = 86_400_000;

export type TrustErrorCode = "payout_hold" | "starter_limit" | "fx_unavailable" | "reports_pause";

export class TrustLimitError extends Error {
  readonly code: TrustErrorCode;
  constructor(code: TrustErrorCode, message: string) {
    super(message);
    this.name = "TrustLimitError";
    this.code = code;
  }
}

// ---------- config ----------

export async function getTrustConfig() {
  return prisma.organizerTrustConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function updateTrustConfig(input: {
  starterMaxEntryFeeUsd: number;
  starterMaxPrizeUsd: number;
  starterMaxPaidEntrants: number;
  graduationEvents: number;
  payoutGraceDays: number;
  reportPauseThreshold: number;
  idRetentionDays: number;
  idRejectedRetentionDays: number;
  idValidityMonths: number;
}) {
  const { starterMaxEntryFeeUsd: fee, starterMaxPrizeUsd: prize, starterMaxPaidEntrants: n, graduationEvents: g, payoutGraceDays: d } = input;
  const { idRetentionDays: keep, idRejectedRetentionDays: keepRejected, idValidityMonths: valid, reportPauseThreshold: rp } = input;
  if (![fee, prize, n, g, d, keep, keepRejected, valid, rp].every((v) => Number.isFinite(v) && v >= 0)) {
    return { error: "validation_error" as const, message: "Every value must be a number, zero or more." };
  }
  if (![n, g, d, keep, keepRejected, valid, rp].every(Number.isInteger)) {
    return { error: "validation_error" as const, message: "Entrants, events and days must be whole numbers." };
  }
  const data = await prisma.organizerTrustConfig.upsert({
    where: { id: "default" },
    update: { starterMaxEntryFeeUsd: fee, starterMaxPrizeUsd: prize, starterMaxPaidEntrants: n, graduationEvents: g, payoutGraceDays: d, reportPauseThreshold: rp, idRetentionDays: keep, idRejectedRetentionDays: keepRejected, idValidityMonths: Math.max(1, valid) },
    create: { id: "default", starterMaxEntryFeeUsd: fee, starterMaxPrizeUsd: prize, starterMaxPaidEntrants: n, graduationEvents: g, payoutGraceDays: d, reportPauseThreshold: rp, idRetentionDays: keep, idRejectedRetentionDays: keepRejected, idValidityMonths: Math.max(1, valid) },
  });
  return { data };
}

// ---------- status ----------

// Completed prize tournaments where every winner explicitly confirmed.
export async function countFullyConfirmedEvents(organizerId: string) {
  return prisma.tournament.count({
    where: {
      organizerId,
      status: "completed",
      prizePayouts: { some: {} },
      NOT: { prizePayouts: { some: { status: { not: "confirmed" } } } },
    },
  });
}

// Completed prize tournaments past the grace period whose payout is
// unmarked or disputed. Each one blocks new paid/prized events.
export type HoldReason = "disputed" | "not_marked_paid" | "refunds_not_confirmed";

export const HOLD_REASON_TEXT: Record<HoldReason, string> = {
  disputed: "a winner reported not being paid",
  not_marked_paid: "prize payout not marked as sent",
  refunds_not_confirmed: "refunds for a cancelled event not confirmed",
};

// Unsettled obligations from earlier events. Each blocks new paid/prized
// events: prize tournaments past the grace period whose payout is unmarked
// or disputed, and cancelled paid events whose refunds weren't confirmed by
// their due date. graceDays = 0 means "anything outstanding right now".
export async function getPayoutHolds(organizerId: string, graceDays: number) {
  const cutoff = new Date(Date.now() - graceDays * DAY_MS);
  const [prizeRows, cancelled] = await Promise.all([
    prisma.tournament.findMany({
      where: {
        organizerId,
        status: "completed",
        completedAt: { lt: cutoff },
        AND: [
          { OR: [{ prizePoolAmount: { not: null } }, { prizeAwards: { some: {} } }] },
          { OR: [{ payoutConfirmed: false }, { prizePayouts: { some: { status: "disputed" } } }] },
        ],
      },
      select: { id: true, name: true, payoutConfirmed: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.tournament.findMany({
      where: {
        organizerId,
        status: "cancelled",
        refundsConfirmedAt: null,
        cancelRefundsDueAt: graceDays === 0 ? { not: null } : { lt: new Date() },
      },
      select: { id: true, name: true },
    }),
  ]);
  return [
    ...prizeRows.map((t) => ({
      tournamentId: t.id,
      name: t.name,
      reason: (t.payoutConfirmed ? "disputed" : "not_marked_paid") as HoldReason,
    })),
    ...cancelled.map((t) => ({ tournamentId: t.id, name: t.name, reason: "refunds_not_confirmed" as HoldReason })),
  ];
}

export async function getOrganizerTrustSummary(organizerId: string) {
  const [cfg, organizer, confirmed] = await Promise.all([
    getTrustConfig(),
    prisma.organizerProfile.findUnique({
      where: { id: organizerId },
      select: { limitsLifted: true, identity: { select: { status: true, validUntil: true } } },
    }),
    countFullyConfirmedEvents(organizerId),
  ]);
  const holds = await getPayoutHolds(organizerId, cfg.payoutGraceDays);
  // A verified identity lifts the starter limits too (the other ways: an admin
  // lifts them, or enough prize events were fully confirmed). Payout holds
  // still apply to everyone.
  const identityVerified = isIdentityVerified(organizer?.identity);
  const graduated = Boolean(organizer?.limitsLifted) || identityVerified || confirmed >= cfg.graduationEvents;
  // Switched off: the dashboard shows no limits or holds (the admin queue still lists them).
  if (!(await getFeatureFlags()).organizerTrust) {
    return { cfg, graduated: true, identityVerified, limitsLifted: Boolean(organizer?.limitsLifted), confirmedEvents: confirmed, eventsNeeded: 0, holds: [] };
  }
  return {
    cfg,
    graduated,
    identityVerified,
    limitsLifted: Boolean(organizer?.limitsLifted),
    confirmedEvents: confirmed,
    eventsNeeded: Math.max(0, cfg.graduationEvents - confirmed),
    holds,
  };
}


// ---------- deposit backing ----------

// Held security deposits in USD, or null if a currency can't be converted.
async function getHeldDepositUsd(organizerId: string): Promise<number | null> {
  const deps = await prisma.securityDeposit.findMany({
    where: { organizerId, status: "held" },
    select: { amount: true, currency: true },
  });
  let total = 0;
  for (const d of deps) {
    const fx = await tryToUsd(Number(d.amount.toString()), d.currency);
    if ("error" in fx) return null;
    total += fx.usd;
  }
  return total;
}

// Money at risk in ONE event, in USD: what players could pay in, or the
// prize pool owed to winners, whichever is larger (prizes are normally funded
// from entry fees, so adding them would double count).
async function eventExposureUsd(e: {
  entryType: string;
  entryFeeAmount: { toString(): string } | null;
  entryFeeCurrency: string | null;
  maxTeams: number | null;
  prizePoolAmount: { toString(): string } | null;
  prizePoolCurrency: string | null;
}): Promise<number | null> {
  let fees = 0;
  let prize = 0;
  if (e.entryType === "paid" && e.entryFeeAmount && e.entryFeeCurrency && e.maxTeams) {
    const fx = await tryToUsd(Number(e.entryFeeAmount.toString()), e.entryFeeCurrency);
    if ("error" in fx) return null;
    fees = fx.usd * e.maxTeams;
  }
  if (e.prizePoolAmount && e.prizePoolCurrency) {
    const fx = await tryToUsd(Number(e.prizePoolAmount.toString()), e.prizePoolCurrency);
    if ("error" in fx) return null;
    prize = fx.usd;
  }
  return Math.max(fees, prize);
}

async function liveExposureUsd(organizerId: string, excludeId?: string): Promise<number | null> {
  const live = await prisma.tournament.findMany({
    where: {
      organizerId,
      status: { in: ["published", "registration_open", "in_progress"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { entryType: true, entryFeeAmount: true, entryFeeCurrency: true, maxTeams: true, prizePoolAmount: true, prizePoolCurrency: true },
  });
  let total = 0;
  for (const t of live) {
    const x = await eventExposureUsd(t);
    if (x === null) return null;
    total += x;
  }
  return total;
}

// ---------- the gate ----------

export interface TrustCheckInput {
  organizerId: string;
  // When re-checking an existing tournament, leave it out of the live total.
  tournamentId?: string;
  entryType: "free" | "paid";
  entryFee?: { amount: number; currency: string } | null;
  prizePool?: { amount: number; currency: string } | null;
  maxTeams?: number | null;
}

type TrustResult = { ok: true } | { ok: false; code: TrustErrorCode; message: string };

// Called when a tournament is created and again when it's published (the
// real boundary — a draft made while eligible can't be published while on
// hold). Free events with no prize are never restricted.
export async function checkOrganizerTrust(input: TrustCheckInput): Promise<TrustResult> {
  const paid = input.entryType === "paid" && !!input.entryFee && input.entryFee.amount > 0;
  const prized = !!input.prizePool && input.prizePool.amount > 0;
  if (!paid && !prized) return { ok: true };

  // Player reports: an organizer paused after enough reports can't create or
  // publish new paid or prized events until an admin lifts it (independent of
  // the organizer-trust switch).
  const pause = await getOrganizerPause(input.organizerId);
  if (pause.paused) {
    return {
      ok: false,
      code: "reports_pause",
      message: "Your paid and prized events are paused while an admin reviews player reports. Contact support to resolve it.",
    };
  }

  // Admin switch: with organizer trust off there are no starter limits, no
  // deposit-backed cap and no payout hold when creating or publishing events.
  if (!(await getFeatureFlags()).organizerTrust) return { ok: true };

  const s = await getOrganizerTrustSummary(input.organizerId);

  if (s.holds.length > 0) {
    const names = s.holds.slice(0, 3).map((h) => `"${h.name}"`).join(", ");
    return {
      ok: false,
      code: "payout_hold",
      message: `You can't host new paid or prized events until earlier prize payouts are settled: ${names}. Confirm payouts or refunds you've sent, or resolve a winner's dispute with an admin.`,
    };
  }

  if (s.graduated) return { ok: true };

  // A held security deposit replaces the starter limits: all live paid or
  // prized events together may put up to (deposit in USD) x multiplier at risk.
  const heldUsd = await getHeldDepositUsd(input.organizerId);
  if (heldUsd === null) {
    return { ok: false, code: "fx_unavailable", message: "Couldn't value your security deposit right now — try again shortly." };
  }
  if (heldUsd > 0) {
    const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
    const multiplier = Number(settings?.depositExposureMultiplier ?? 5);
    const thisEvent = await eventExposureUsd({
      entryType: input.entryType,
      entryFeeAmount: input.entryFee ? String(input.entryFee.amount) : null,
      entryFeeCurrency: input.entryFee?.currency ?? null,
      maxTeams: input.maxTeams ?? null,
      prizePoolAmount: input.prizePool ? String(input.prizePool.amount) : null,
      prizePoolCurrency: input.prizePool?.currency ?? null,
    } as Parameters<typeof eventExposureUsd>[0]);
    const others = await liveExposureUsd(input.organizerId, input.tournamentId);
    if (thisEvent === null || others === null) {
      return { ok: false, code: "fx_unavailable", message: "Couldn't check this event against your security deposit right now — try again shortly." };
    }
    const cap = heldUsd * multiplier;
    if (others + thisEvent > cap) {
      return {
        ok: false,
        code: "starter_limit",
        message: `Your security deposit (~$${heldUsd.toFixed(0)}) supports up to ~$${cap.toFixed(0)} of live paid or prized events at once. Your live events plus this one would be ~$${(others + thisEvent).toFixed(0)}. Raise your deposit by upgrading your plan, or wait for a live event to finish.`,
      };
    }
    return { ok: true };
  }

  const { cfg } = s;
  const progress = `Complete ${s.eventsNeeded} more prize event${s.eventsNeeded === 1 ? "" : "s"} where every winner confirms they were paid to lift these limits.`;

  if (paid) {
    const fx = await tryToUsd(input.entryFee!.amount, input.entryFee!.currency);
    if ("error" in fx) {
      return { ok: false, code: "fx_unavailable", message: "Couldn't check the entry fee against the new-organizer limit right now — try again shortly." };
    }
    if (fx.usd > Number(cfg.starterMaxEntryFeeUsd)) {
      return {
        ok: false,
        code: "starter_limit",
        message: `New organizers can charge up to about $${cfg.starterMaxEntryFeeUsd} per entry (this converts to ~$${fx.usd.toFixed(2)}). ${progress}`,
      };
    }
    if (input.maxTeams && input.maxTeams > cfg.starterMaxPaidEntrants) {
      return {
        ok: false,
        code: "starter_limit",
        message: `New organizers can host paid events with up to ${cfg.starterMaxPaidEntrants} entrants. ${progress}`,
      };
    }
  }

  if (prized) {
    const fx = await tryToUsd(input.prizePool!.amount, input.prizePool!.currency);
    if ("error" in fx) {
      return { ok: false, code: "fx_unavailable", message: "Couldn't check the prize pool against the new-organizer limit right now — try again shortly." };
    }
    if (fx.usd > Number(cfg.starterMaxPrizeUsd)) {
      return {
        ok: false,
        code: "starter_limit",
        message: `New organizers can offer prize pools up to about $${cfg.starterMaxPrizeUsd} (this converts to ~$${fx.usd.toFixed(2)}). ${progress}`,
      };
    }
  }
  return { ok: true };
}

// ---------- payouts: organizer marks paid, winners answer ----------

// Winners = registrations whose final placement falls inside a prize row.
// A prize row's amount is per place (positionFrom..positionTo each get it).
async function findWinners(tournamentId: string) {
  const [tiers, regs] = await Promise.all([
    prisma.prizeTier.findMany({ where: { tournamentId } }),
    prisma.registration.findMany({
      where: { tournamentId, placement: { not: null }, status: "approved" },
      select: {
        id: true,
        placement: true,
        player: { select: { userId: true } },
        teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
      },
    }),
  ]);
  return regs.flatMap((r) => {
    const tier = tiers.find((t) => r.placement! >= t.positionFrom && r.placement! <= t.positionTo);
    if (!tier) return [];
    const userIds = [
      ...(r.player ? [r.player.userId] : []),
      ...(r.teamEntry?.members.map((m) => m.player.userId) ?? []),
    ];
    return [{ registrationId: r.id, amount: tier.amount, userIds }];
  });
}

// Replaces markPayoutConfirmed's effect: besides the organizer's flag, each
// winner now gets a payout record to confirm or dispute.
export async function markPrizesPaid(tournamentId: string, organizerUserId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: true, prizeAwards: { orderBy: { sortOrder: "asc" } } },
  });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizer.userId !== organizerUserId) return { error: "forbidden" as const };
  if (tournament.status !== "completed") return { error: "not_completed" as const };

  const hasPool = !!tournament.prizePoolAmount && !!tournament.prizePoolCurrency;
  if (!hasPool && tournament.prizeAwards.length === 0) return { error: "no_prize_pool" as const };

  // Every special award needs a winner before payouts can be marked.
  const unassigned = tournament.prizeAwards.filter((a) => !a.winnerUserId);
  if (unassigned.length > 0) {
    return { error: "awards_unassigned" as const, message: `Pick a winner for: ${unassigned.map((a) => a.name).join(", ")}.` };
  }

  const winners = hasPool ? await findWinners(tournamentId) : [];
  const currency = tournament.prizePoolCurrency ?? tournament.entryFeeCurrency ?? "PKR";
  await prisma.$transaction([
    prisma.tournament.update({ where: { id: tournamentId }, data: { payoutConfirmed: true } }),
    prisma.prizePayout.createMany({
      data: winners.map((w) => ({
        tournamentId,
        registrationId: w.registrationId,
        amount: w.amount,
        currency,
      })),
      skipDuplicates: true,
    }),
    prisma.prizePayout.createMany({
      data: tournament.prizeAwards.map((a) => ({
        tournamentId,
        awardId: a.id,
        recipientUserId: a.winnerUserId!,
        amount: a.cashAmount ?? 0,
        currency,
        description: a.prizeText,
      })),
      skipDuplicates: true,
    }),
  ]);

  for (const w of winners) {
    await notifyMany(w.userIds, {
      type: "prize_payout",
      title: "Your prize was marked as paid — please confirm",
      body: `${tournament.organizer.orgName} says they paid your prize for "${tournament.name}". Confirm if you received it, or tell us if you didn't.`,
      href: "/payouts",
    });
  }
  for (const a of tournament.prizeAwards) {
    await notify(a.winnerUserId!, {
      type: "prize_payout",
      title: `Your award was marked as given: ${a.name}`,
      body: `${tournament.organizer.orgName} says they gave you the "${a.name}" award for "${tournament.name}". Confirm if you received it, or tell us if you didn't.`,
      href: "/payouts",
    });
  }
  return { data: { winners: winners.length, awards: tournament.prizeAwards.length } };
}

export async function listPayoutsForPlayer(userId: string) {
  return prisma.prizePayout.findMany({
    where: {
      OR: [
        { recipientUserId: userId },
        { registration: { player: { userId } } },
        { registration: { teamEntry: { members: { some: { player: { userId } } } } } },
      ],
    },
    orderBy: { organizerMarkedAt: "desc" },
    include: {
      tournament: { select: { name: true, organizer: { select: { orgName: true } } } },
      award: { select: { name: true } },
    },
  });
}

export async function respondToPayout(input: { userId: string; payoutId: string; response: "confirmed" | "disputed"; note?: string }) {
  const payout = await prisma.prizePayout.findUnique({
    where: { id: input.payoutId },
    include: {
      tournament: { select: { name: true, organizer: { select: { userId: true } } } },
      registration: {
        select: {
          player: { select: { userId: true } },
          teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
        },
      },
    },
  });
  if (!payout) return { error: "not_found" as const };
  const sideIds = payout.recipientUserId
    ? [payout.recipientUserId]
    : [
        ...(payout.registration?.player ? [payout.registration.player.userId] : []),
        ...(payout.registration?.teamEntry?.members.map((m) => m.player.userId) ?? []),
      ];
  if (!sideIds.includes(input.userId)) return { error: "forbidden" as const };
  if (payout.status === "confirmed") return { error: "already_confirmed" as const };

  const note = input.note?.trim() || null;
  if (input.response === "disputed" && (!note || note.length < 10)) {
    return { error: "validation_error" as const, message: "Tell us what happened (at least 10 characters)." };
  }

  const data = await prisma.prizePayout.update({
    where: { id: payout.id },
    data: { status: input.response, winnerRespondedAt: new Date(), winnerNote: note },
  });
  await notify(payout.tournament.organizer.userId, {
    type: "prize_payout",
    title: input.response === "confirmed" ? "A winner confirmed their prize" : "A winner says they were NOT paid",
    body:
      input.response === "confirmed"
        ? `A winner of "${payout.tournament.name}" confirmed they received their prize.`
        : `A winner of "${payout.tournament.name}" disputed the payout. You can't host new paid events until this is resolved.`,
    href: "/organizer/dashboard",
  });
  return { data };
}

// ---------- admin ----------

export async function listDisputedPayouts() {
  const rows = await prisma.prizePayout.findMany({
    where: { status: "disputed" },
    orderBy: { winnerRespondedAt: "asc" },
    include: {
      tournament: { select: { name: true, organizer: { select: { id: true, orgName: true, user: { select: { id: true, email: true } } } } } },
      award: { select: { name: true } },
      registration: { select: { player: { select: { user: { select: { displayName: true, email: true } } } }, teamEntry: { select: { name: true } } } },
    },
  });
  // Award payouts have a recipient user rather than a registration.
  const recipientIds = Array.from(new Set(rows.map((r) => r.recipientUserId).filter((x): x is string => !!x)));
  const recipients = recipientIds.length
    ? await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, displayName: true } })
    : [];
  return rows.map((r) => ({ ...r, recipientName: recipients.find((u) => u.id === r.recipientUserId)?.displayName ?? null }));
}

// Admin decides the winner WAS paid (or the matter is settled).
export async function settlePayout(adminId: string, payoutId: string, note: string) {
  const text = note.trim();
  if (!text) return { error: "validation_error" as const, message: "Add a note explaining the decision." };
  const payout = await prisma.prizePayout.findUnique({ where: { id: payoutId } });
  if (!payout) return { error: "not_found" as const };
  await prisma.$transaction([
    prisma.prizePayout.update({ where: { id: payoutId }, data: { status: "confirmed", adminNote: text } }),
    prisma.adminActionLog.create({
      data: { adminId, action: "settled_prize_payout", targetType: "PrizePayout", targetId: payoutId, notes: text },
    }),
  ]);
  return { data: { id: payoutId } };
}

export async function listOrganizersOnHold() {
  const cfg = await getTrustConfig();
  const organizers = await prisma.organizerProfile.findMany({
    where: { tournaments: { some: { status: "completed", OR: [{ prizePoolAmount: { not: null } }, { prizeAwards: { some: {} } }] } } },
    select: { id: true, orgName: true, limitsLifted: true, user: { select: { email: true } } },
  });
  const out = [];
  for (const o of organizers) {
    const holds = await getPayoutHolds(o.id, cfg.payoutGraceDays);
    if (holds.length) out.push({ ...o, holds });
  }
  return out;
}

export async function setLimitsLifted(adminId: string, organizerId: string, lifted: boolean) {
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
  if (!org) return { error: "not_found" as const };
  await prisma.$transaction([
    prisma.organizerProfile.update({ where: { id: organizerId }, data: { limitsLifted: lifted } }),
    prisma.adminActionLog.create({
      data: { adminId, action: lifted ? "lifted_starter_limits" : "restored_starter_limits", targetType: "OrganizerProfile", targetId: organizerId },
    }),
  ]);
  return { data: { id: organizerId } };
}
