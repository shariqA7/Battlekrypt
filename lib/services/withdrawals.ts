// A team (or player) pulls out. The seat is freed at once and the next team in line gets it. What
// happens to the entry fee is the organizer's refund policy, decided before anyone paid.
// BattleKrypt never holds the money: the organizer received it, so the organizer sends refunds and
// marks them done here, and the player sees where theirs stands.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import { lockSeats, refreshSeats } from "@/lib/services/rooms";
import { roomLabel, roomStart } from "@/lib/rooms";
import { decideRefund, nextRefundStatus, REFUND_STATUS_LABEL, withdrawBlock, type RefundAction, type RefundStatusKey } from "@/lib/refunds";
import type { RefundPolicyKey } from "@/lib/seat-settings";

export type WithdrawError = "not_found" | "forbidden" | "not_active" | "closed" | "started";

export const WITHDRAW_MESSAGES: Record<WithdrawError, [number, string]> = {
  not_found: [404, "Entry not found."],
  forbidden: [403, "Only the person who entered can withdraw this entry."],
  not_active: [409, "This entry isn't active, so there is nothing to withdraw."],
  closed: [409, "This tournament has already started or ended. Contact the organizer."],
  started: [409, "Your room has already started, so it's too late to withdraw. Contact the organizer."],
};

const money = (amount: unknown, currency: string | null) => (amount ? `${currency ?? ""} ${Number(amount).toLocaleString("en-US")}`.trim() : "");

async function nameOfEntry(r: { teamEntry: { name: string } | null; player: { user: { displayName: string } } | null }) {
  return r.teamEntry?.name ?? r.player?.user.displayName ?? "A team";
}

export async function withdrawEntry(
  registrationId: string,
  userId: string,
  reason?: string,
): Promise<{ error: WithdrawError } | { ok: true; hadSeat: boolean; refund: { status: RefundStatusKey; reason: string } }> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true, status: true, tournamentId: true, payerUserId: true, paymentProofUrl: true, paymentStatus: true,
      teamEntry: { select: { name: true } },
      player: { select: { userId: true, user: { select: { displayName: true } } } },
      room: { select: { startAt: true, number: true, name: true } },
      tournament: {
        select: {
          id: true, name: true, slug: true, status: true, startAt: true, entryType: true, refundPolicy: true, refundCutoffHours: true,
          entryFeeAmount: true, entryFeeCurrency: true, organizer: { select: { userId: true } },
        },
      },
    },
  });
  if (!reg) return { error: "not_found" };
  if (reg.payerUserId !== userId && reg.player?.userId !== userId) return { error: "forbidden" };

  const now = new Date();
  const start = roomStart(reg.room ?? { startAt: null }, reg.tournament.startAt);
  const block = withdrawBlock({ entryStatus: reg.status, tournamentStatus: reg.tournament.status, roomStart: start, now });
  if (block) return { error: block };

  const hadSeat = reg.status !== "waitlisted";
  const refund = decideRefund({
    policy: reg.tournament.refundPolicy as RefundPolicyKey,
    cutoffHours: reg.tournament.refundCutoffHours,
    entryType: reg.tournament.entryType,
    sentMoney: !!reg.paymentProofUrl || reg.paymentStatus === "paid",
    hadSeat, roomStart: start, now,
  });
  const decidedNow = refund.status === "owed" || refund.status === "declined";

  const done = await prisma.$transaction(async (tx) => {
    await lockSeats(tx, reg.tournamentId);
    const fresh = await tx.registration.findUnique({ where: { id: reg.id }, select: { status: true } });
    if (!fresh || !["pending", "approved", "waitlisted"].includes(fresh.status)) return false; // someone got there first
    await tx.registration.update({
      where: { id: reg.id },
      data: {
        status: "withdrawn", withdrawnAt: now, withdrawReason: reason?.trim().slice(0, 200) || null, payDueAt: null,
        refundStatus: refund.status, refundDecidedAt: decidedNow ? now : null,
      },
    });
    return true;
  });
  if (!done) return { error: "not_active" };

  await refreshSeats(reg.tournamentId); // the next team in line takes the seat (and may settle a resale refund)
  const after = await prisma.registration.findUnique({ where: { id: reg.id }, select: { refundStatus: true } });
  const finalStatus = (after?.refundStatus ?? refund.status) as RefundStatusKey;
  const finalReason = finalStatus === "owed" && refund.status === "waiting_resale" ? "Another team took your seat, so you get a refund." : refund.reason;

  const who = await nameOfEntry(reg);
  const where = reg.room ? ` (${roomLabel(reg.room)})` : "";
  const fee = money(reg.tournament.entryFeeAmount, reg.tournament.entryFeeCurrency);
  const refundLine =
    finalStatus === "owed" ? `A refund of ${fee || "the entry fee"} is due to them.`
    : finalStatus === "requested" ? "They asked for a refund. Decide on it in the Refunds tab."
    : finalStatus === "waiting_resale" ? "Their refund is due if another team takes the seat."
    : finalStatus === "declined" ? "No refund is due under your policy."
    : "";
  await notify(reg.tournament.organizer.userId, {
    type: "entry_withdrawn",
    title: `${who} withdrew from ${reg.tournament.name}${where}`,
    body: `${hadSeat ? "Their seat has been offered to the next team in line." : "They had been on the waiting list."} ${refundLine}`.trim(),
    href: "/organizer/dashboard",
  });
  await notify(userId, {
    type: "withdrawal_confirmed",
    title: `You withdrew from ${reg.tournament.name}`,
    body: finalReason,
    href: `/tournaments/${reg.tournament.slug}`,
  });
  return { ok: true, hadSeat, refund: { status: finalStatus, reason: finalReason } };
}

// ---- unsold resales ---------------------------------------------------------------------------

/** A "refund if resold" withdrawal whose room has started without anyone taking the seat is declined. */
export async function closeUnsoldResales(tournamentId: string): Promise<number> {
  const rows = await prisma.registration.findMany({
    where: { tournamentId, refundStatus: "waiting_resale" },
    select: { id: true, room: { select: { startAt: true } }, tournament: { select: { startAt: true } } },
  });
  const now = Date.now();
  const lapsed = rows.filter((r) => {
    const at = r.room?.startAt ?? r.tournament.startAt;
    return at && at.getTime() <= now;
  });
  if (lapsed.length === 0) return 0;
  await prisma.registration.updateMany({ where: { id: { in: lapsed.map((l) => l.id) } }, data: { refundStatus: "declined", refundDecidedAt: new Date() } });
  return lapsed.length;
}

// ---- the organizer's refunds list ---------------------------------------------------------------

export interface RefundRow {
  id: string;
  name: string;
  refundStatus: RefundStatusKey;
  statusLabel: string;
  hadSeat: boolean;
  room: string | null;
  amount: string;
  paymentReference: string | null;
  payerName: string | null;
  withdrawnAt: Date;
  withdrawReason: string | null;
}

export async function listRefunds(tournamentId: string, organizerId: string): Promise<{ error: "not_found" | "forbidden" } | { rows: RefundRow[]; policy: { policy: RefundPolicyKey; cutoffHours: number } }> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { organizerId: true, entryFeeAmount: true, entryFeeCurrency: true, refundPolicy: true, refundCutoffHours: true } });
  if (!t) return { error: "not_found" };
  if (t.organizerId !== organizerId) return { error: "forbidden" };
  await closeUnsoldResales(tournamentId);
  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: "withdrawn", refundStatus: { not: "not_applicable" } },
    orderBy: { withdrawnAt: "desc" },
    select: {
      id: true, refundStatus: true, paymentReference: true, withdrawnAt: true, withdrawReason: true, waitlistedAt: true, promotedAt: true,
      teamEntry: { select: { name: true } },
      player: { select: { user: { select: { displayName: true } } } },
      room: { select: { number: true, name: true } },
    },
  });
  const payers = await prisma.registration.findMany({ where: { id: { in: regs.map((r) => r.id) } }, select: { id: true, payerUserId: true } });
  const payerIds = payers.map((p) => p.payerUserId).filter((x): x is string => !!x);
  const users = await prisma.user.findMany({ where: { id: { in: payerIds } }, select: { id: true, displayName: true } });
  const payerName = new Map(payers.map((p) => [p.id, users.find((u) => u.id === p.payerUserId)?.displayName ?? null]));
  return {
    policy: { policy: t.refundPolicy as RefundPolicyKey, cutoffHours: t.refundCutoffHours },
    rows: regs.map((r) => ({
      id: r.id, name: r.teamEntry?.name ?? r.player?.user.displayName ?? "A team", refundStatus: r.refundStatus as RefundStatusKey,
      statusLabel: REFUND_STATUS_LABEL[r.refundStatus as RefundStatusKey],
      hadSeat: !(r.waitlistedAt && !r.promotedAt && !r.room),
      room: r.room ? roomLabel(r.room) : null,
      amount: money(t.entryFeeAmount, t.entryFeeCurrency),
      paymentReference: r.paymentReference, payerName: payerName.get(r.id) ?? null,
      withdrawnAt: r.withdrawnAt as Date, withdrawReason: r.withdrawReason,
    })),
  };
}

export type RefundActionError = "not_found" | "forbidden" | "not_allowed";

export async function actOnRefund(registrationId: string, organizerId: string, action: RefundAction): Promise<{ error: RefundActionError } | { ok: true; status: RefundStatusKey }> {
  const r = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true, status: true, refundStatus: true, payerUserId: true,
      player: { select: { userId: true } },
      tournament: { select: { organizerId: true, name: true, slug: true, entryFeeAmount: true, entryFeeCurrency: true } },
    },
  });
  if (!r) return { error: "not_found" };
  if (r.tournament.organizerId !== organizerId) return { error: "forbidden" };
  if (r.status !== "withdrawn") return { error: "not_allowed" };
  const next = nextRefundStatus(action, r.refundStatus as RefundStatusKey);
  if (!next) return { error: "not_allowed" };
  const now = new Date();
  await prisma.registration.update({
    where: { id: r.id },
    data: { refundStatus: next, refundDecidedAt: now, ...(next === "refunded" ? { refundedAt: now } : {}) },
  });
  const fee = money(r.tournament.entryFeeAmount, r.tournament.entryFeeCurrency) || "your entry fee";
  const text: Record<string, [string, string]> = {
    owed: [`Refund approved for ${r.tournament.name}`, `The organizer approved a refund of ${fee}. They will send it to you.`],
    declined: [`No refund for ${r.tournament.name}`, "The organizer decided not to refund this entry."],
    refunded: [`Refund sent for ${r.tournament.name}`, `The organizer says your ${fee} refund has been sent. If it hasn't arrived, tell them.`],
  };
  const to = r.payerUserId ?? r.player?.userId;
  if (to && text[next]) await notify(to, { type: `refund_${next}`, title: text[next][0], body: text[next][1], href: `/tournaments/${r.tournament.slug}` });
  return { ok: true, status: next };
}
