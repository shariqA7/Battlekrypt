// What the signed-in player (or the person who paid for a team) sees about their own entry in a
// tournament: where it stands, what withdrawing would do, and, for someone still waiting for a
// seat, other tournaments of the same game that have open seats.
import { prisma } from "@/lib/prisma";
import { SEAT_HOLDING, loadSeatState } from "@/lib/services/rooms";
import { queuePosition, roomLabel, roomStart } from "@/lib/rooms";
import { decideRefund, REFUND_STATUS_LABEL, withdrawBlock, type RefundStatusKey } from "@/lib/refunds";
import { describeRefundPolicy, type RefundPolicyKey } from "@/lib/seat-settings";

export interface MyEntry {
  id: string;
  status: string;
  name: string;
  /** Only the person who entered (or paid) can withdraw or send a payment. */
  canManage: boolean;
  room: { label: string; startAt: string | null } | null;
  position: number | null;
  waitingTotal: number;
  payDueAt: string | null;
  needsPayment: boolean;
  releaseReason: string | null;
  refund: { status: RefundStatusKey; label: string } | null;
  /** What would happen if they withdrew right now (null when they can't). */
  withdraw: { hadSeat: boolean; refundStatus: RefundStatusKey; refundText: string } | null;
}

export interface OpenSlot {
  id: string;
  slug: string;
  name: string;
  startAt: string | null;
  seatsLeft: number;
  entryType: "free" | "paid";
  fee: { amount: number; currency: string } | null;
}

export interface MyEntryView {
  entries: MyEntry[];
  policy: { text: string; policy: RefundPolicyKey; cutoffHours: number; paid: boolean };
  alternatives: OpenSlot[];
}

export async function getMyEntry(tournamentId: string, userId: string): Promise<MyEntryView | null> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, gameId: true, status: true, startAt: true, entryType: true, refundPolicy: true, refundCutoffHours: true },
  });
  if (!t) return null;
  const policy = {
    text: describeRefundPolicy(t.refundPolicy as RefundPolicyKey, t.refundCutoffHours),
    policy: t.refundPolicy as RefundPolicyKey, cutoffHours: t.refundCutoffHours, paid: t.entryType === "paid",
  };

  const regs = await prisma.registration.findMany({
    where: {
      tournamentId,
      status: { in: ["pending", "approved", "waitlisted", "withdrawn"] },
      OR: [{ payerUserId: userId }, { player: { userId } }, { teamEntry: { members: { some: { player: { userId } } } } }],
    },
    orderBy: { registeredAt: "desc" },
    take: 5,
    select: {
      id: true, status: true, payerUserId: true, payDueAt: true, paymentProofUrl: true, paymentStatus: true, releaseReason: true, refundStatus: true,
      teamEntry: { select: { name: true } },
      player: { select: { userId: true, user: { select: { displayName: true } } } },
      room: { select: { number: true, name: true, startAt: true } },
    },
  });
  if (regs.length === 0) return { entries: [], policy, alternatives: [] };

  const seat = regs.some((r) => r.status === "waitlisted") ? await loadSeatState(prisma, tournamentId) : null;
  const now = new Date();
  const entries: MyEntry[] = regs.map((r) => {
    const canManage = r.payerUserId === userId || r.player?.userId === userId;
    const start = roomStart(r.room ?? { startAt: null }, t.startAt);
    const blocked = withdrawBlock({ entryStatus: r.status, tournamentStatus: t.status, roomStart: start, now });
    const dec = decideRefund({
      policy: t.refundPolicy as RefundPolicyKey, cutoffHours: t.refundCutoffHours, entryType: t.entryType,
      sentMoney: !!r.paymentProofUrl || r.paymentStatus === "paid", hadSeat: r.status !== "waitlisted", roomStart: start, now,
    });
    return {
      id: r.id, status: r.status, canManage,
      name: r.teamEntry?.name ?? r.player?.user.displayName ?? "Your entry",
      room: r.room ? { label: roomLabel(r.room), startAt: r.room.startAt?.toISOString() ?? null } : null,
      position: r.status === "waitlisted" && seat ? queuePosition(seat.waiting, r.id) : null,
      waitingTotal: seat?.waiting.length ?? 0,
      payDueAt: r.payDueAt?.toISOString() ?? null,
      needsPayment: r.status === "pending" && !!r.payDueAt && !r.paymentProofUrl,
      releaseReason: r.releaseReason,
      refund: r.status === "withdrawn" && r.refundStatus !== "not_applicable" ? { status: r.refundStatus as RefundStatusKey, label: REFUND_STATUS_LABEL[r.refundStatus as RefundStatusKey] } : null,
      withdraw: canManage && !blocked ? { hadSeat: r.status !== "waitlisted", refundStatus: dec.status, refundText: dec.reason } : null,
    };
  });

  // Other slots for the same game: only worth computing for someone who is waiting for a seat.
  let alternatives: OpenSlot[] = [];
  if (entries.some((e) => e.status === "waitlisted")) {
    const others = await prisma.tournament.findMany({
      where: {
        gameId: t.gameId, id: { not: tournamentId }, status: { in: ["published", "registration_open"] },
        audienceScope: { not: "institution" }, OR: [{ startAt: null }, { startAt: { gte: now } }],
      },
      orderBy: [{ startAt: "asc" }], take: 30,
      select: { id: true, slug: true, name: true, startAt: true, maxTeams: true, entryType: true, entryFeeAmount: true, entryFeeCurrency: true },
    });
    const held = await prisma.registration.groupBy({
      by: ["tournamentId"], where: { tournamentId: { in: others.map((o) => o.id) }, status: { in: [...SEAT_HOLDING] } }, _count: { _all: true },
    });
    const taken = new Map(held.map((h) => [h.tournamentId, h._count._all]));
    alternatives = others
      .map((o) => ({ o, left: o.maxTeams - (taken.get(o.id) ?? 0) }))
      .filter((x) => x.left > 0)
      .slice(0, 6)
      .map(({ o, left }) => ({
        id: o.id, slug: o.slug, name: o.name, startAt: o.startAt?.toISOString() ?? null, seatsLeft: left, entryType: o.entryType,
        fee: o.entryFeeAmount ? { amount: Number(o.entryFeeAmount), currency: o.entryFeeCurrency ?? "PKR" } : null,
      }));
  }
  return { entries, policy, alternatives };
}
