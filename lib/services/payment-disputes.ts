// Payment disputes between the person who paid an entry fee and the organizer who received it.
// The platform never holds this money: an admin decides, and when the payer is right the
// organizer is ORDERED to refund directly. The case then tracks the refund until the payer
// confirms it. Rules (who may open what, deadlines) live in lib/payment-disputes.ts.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import { findProofMatches } from "@/lib/services/proof-fingerprints";
import { normalizeProofInput } from "@/lib/proof-storage";
import {
  DISPUTE_KINDS, RESPONSE_HOURS, REFUND_DAYS, addDays, addHours, disputeBlockedReason, isRefundOverdue, refundAmountError,
} from "@/lib/payment-disputes";

const DAY_MS = 86_400_000;
const DISPUTES_PER_DAY = 5;
const MAX_EVIDENCE = 5;

export type DisputeError =
  | "not_found" | "forbidden" | "validation_error" | "not_allowed" | "already_open" | "rate_limited" | "wrong_state";
type Fail = { error: DisputeError; message?: string };
const fail = (error: DisputeError, message?: string): Fail => ({ error, message });

const cleanEvidence = (v: unknown, userId: string): string[] =>
  Array.isArray(v) ? v.flatMap((u) => { const n = normalizeProofInput(u, userId); return n ? [n] : []; }).slice(0, MAX_EVIDENCE) : [];

const text = (v: unknown, min: number, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length >= min && s.length <= max ? s : null;
};

// ------------------------------------------------------------------ opening

export async function openDispute(input: { userId: string; registrationId: string; kind: string; reason: unknown; evidenceUrls?: unknown }) {
  const spec = DISPUTE_KINDS.find((k) => k.kind === input.kind);
  if (!spec) return fail("validation_error", "Choose what went wrong.");
  const reason = text(input.reason, 10, 1500);
  if (!reason) return fail("validation_error", "Describe what happened in 10–1500 characters.");

  const reg = await prisma.registration.findUnique({
    where: { id: input.registrationId },
    include: {
      tournament: { select: { id: true, name: true, organizerId: true, entryType: true, entryFeeAmount: true, entryFeeCurrency: true, status: true, organizer: { select: { userId: true } } } },
      player: { select: { userId: true } },
      teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
    },
  });
  if (!reg) return fail("not_found");
  const t = reg.tournament;

  const payerIds: string[] = reg.payerUserId
    ? [reg.payerUserId]
    : reg.player
      ? [reg.player.userId]
      : (reg.teamEntry?.members ?? []).map((m: { player: { userId: string } }) => m.player.userId);
  const isPayer = payerIds.includes(input.userId);
  const isOrganizer = t.organizer.userId === input.userId;
  if (spec.side === "payer" ? !isPayer : !isOrganizer) return fail("forbidden");

  const blocked = disputeBlockedReason(spec.kind, {
    entryType: t.entryType,
    hasProof: !!reg.paymentProofUrl,
    registrationStatus: reg.status,
    tournamentStatus: t.status,
    registeredAt: reg.registeredAt,
    approvedAt: reg.approvedAt,
    now: new Date(),
  });
  if (blocked) return fail("not_allowed", blocked);

  if ((await prisma.paymentDispute.count({ where: { registrationId: reg.id, status: { not: "resolved" } } })) > 0) return fail("already_open");
  if ((await prisma.paymentDispute.count({ where: { openedByUserId: input.userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } })) >= DISPUTES_PER_DAY) return fail("rate_limited");

  const payerUserId = isPayer ? input.userId : (payerIds[0] ?? input.userId);
  const dispute = await prisma.paymentDispute.create({
    data: {
      registrationId: reg.id, tournamentId: t.id, organizerId: t.organizerId,
      payerUserId, organizerUserId: t.organizer.userId,
      kind: spec.kind, openedByUserId: input.userId, reason, openerEvidenceUrls: cleanEvidence(input.evidenceUrls, input.userId),
      responseDueAt: addHours(new Date(), RESPONSE_HOURS),
    },
  });
  const other = spec.side === "payer" ? t.organizer.userId : payerUserId;
  await notify(other, {
    type: "payment_dispute",
    title: `A payment dispute was opened: ${t.name}`,
    body: `You have ${RESPONSE_HOURS} hours to respond. If you don't, an admin will decide with the evidence available.`,
    href: `/disputes/${dispute.id}`,
  });
  return { data: dispute };
}

// ---------------------------------------------------------------- responding

export async function respondToDispute(input: { userId: string; disputeId: string; note: unknown; evidenceUrls?: unknown }) {
  const d = await prisma.paymentDispute.findUnique({ where: { id: input.disputeId } });
  if (!d) return fail("not_found");
  const responder = d.openedByUserId === d.payerUserId ? d.organizerUserId : d.payerUserId;
  if (input.userId !== responder) return fail("forbidden");
  const note = text(input.note, 5, 1500);
  if (!note) return fail("validation_error", "Write your side in 5–1500 characters.");
  const moved = await prisma.paymentDispute.updateMany({
    where: { id: d.id, status: "awaiting_response" },
    data: { status: "awaiting_admin", responderNote: note, responderEvidenceUrls: cleanEvidence(input.evidenceUrls, input.userId), respondedAt: new Date() },
  });
  if (moved.count === 0) return fail("wrong_state", "This case is no longer waiting for a response.");
  await notify(d.openedByUserId, { type: "payment_dispute", title: "The other side responded", body: "An admin will review both sides and decide.", href: `/disputes/${d.id}` });
  return { data: { ok: true as const } };
}

// -------------------------------------------------------------------- sweeps

/** Cases nobody answered go to an admin; organizers who ignore an ordered refund get paused. */
export async function sweepDisputes(now = new Date()) {
  const lapsed = await prisma.paymentDispute.findMany({ where: { status: "awaiting_response", responseDueAt: { lt: now } }, select: { id: true } });
  for (const { id } of lapsed) {
    const moved = await prisma.paymentDispute.updateMany({ where: { id, status: "awaiting_response", responseDueAt: { lt: now } }, data: { status: "awaiting_admin", missedDeadline: true } });
    if (moved.count === 0) continue;
    const d = await prisma.paymentDispute.findUnique({ where: { id } });
    if (!d) continue;
    await notify(d.openedByUserId, { type: "payment_dispute", title: "Sent to an admin", body: "The other side didn't respond in time.", href: `/disputes/${id}` });
    const accused = d.openedByUserId === d.payerUserId ? d.organizerUserId : d.payerUserId;
    await notify(accused, { type: "payment_dispute", title: "No response received", body: "The response time ran out, so an admin will decide with the evidence available.", href: `/disputes/${id}` });
  }

  // Ordered refunds that were never paid: pause the organizer's new paid registrations (the same
  // pause player reports use) until an admin reviews.
  const unpaid = await prisma.paymentDispute.findMany({
    where: { outcome: "for_payer", refundDueAt: { lt: now }, refundSentAt: null, refundReceivedAt: null },
    select: { id: true, organizerId: true, organizerUserId: true, payerUserId: true },
  });
  for (const d of unpaid) {
    const org = await prisma.organizerProfile.findUnique({ where: { id: d.organizerId }, select: { reportsPausedAt: true } });
    if (org?.reportsPausedAt) continue;
    await prisma.organizerProfile.update({ where: { id: d.organizerId }, data: { reportsPausedAt: now, reportsPauseReason: "Did not pay a refund an admin ordered." } });
    await notify(d.organizerUserId, { type: "payment_dispute", title: "Your paid events are paused", body: "A refund an admin ordered wasn't paid in time. New paid registrations and new paid or prized events are paused until you pay it and an admin reviews.", href: `/disputes/${d.id}` });
    await notify(d.payerUserId, { type: "payment_dispute", title: "Your refund is overdue", body: "The organizer didn't pay in time. Their paid events are now paused and an admin will follow up.", href: `/disputes/${d.id}` });
  }
}

// ------------------------------------------------------------------ deciding

export async function decideDispute(input: { adminId: string; disputeId: string; outcome: string; note: unknown; refundAmount?: unknown }) {
  if (input.outcome !== "for_payer" && input.outcome !== "for_organizer") return fail("validation_error", "Choose who the decision is for.");
  const note = text(input.note, 5, 1500);
  if (!note) return fail("validation_error", "Add a note explaining the decision.");
  const d = await prisma.paymentDispute.findUnique({
    where: { id: input.disputeId },
    include: { registration: { select: { id: true, status: true } }, },
  });
  if (!d) return fail("not_found");
  if (d.status !== "awaiting_admin") return fail("wrong_state", "This case isn't waiting for a decision.");
  const t = await prisma.tournament.findUnique({ where: { id: d.tournamentId }, select: { name: true, entryFeeAmount: true, entryFeeCurrency: true } });
  if (!t) return fail("not_found");

  const now = new Date();
  const refunds = d.kind !== "fake_proof" && input.outcome === "for_payer";
  let amount: number | null = null;
  if (refunds && input.refundAmount !== undefined && input.refundAmount !== null && input.refundAmount !== "") {
    amount = Number(input.refundAmount);
    const err = refundAmountError(amount, Number(t.entryFeeAmount?.toString() ?? 0));
    if (err) return fail("validation_error", err);
  }
  const fee = Number(t.entryFeeAmount?.toString() ?? 0);
  if (amount !== null && amount >= fee) amount = null; // "refund everything" is just the full amount

  const claimed = await prisma.paymentDispute.updateMany({
    where: { id: d.id, status: "awaiting_admin" },
    data: {
      status: "resolved", outcome: input.outcome, adminNote: note, resolvedById: input.adminId, resolvedAt: now,
      ...(refunds ? { refundAmount: amount, refundCurrency: t.entryFeeCurrency, refundDueAt: addDays(now, REFUND_DAYS) } : {}),
    },
  });
  if (claimed.count === 0) return fail("wrong_state", "Someone else just decided this case.");

  // A fake proof the admin agrees with takes the entry out of the tournament.
  if (d.kind === "fake_proof" && input.outcome === "for_organizer" && ["pending", "approved"].includes(d.registration.status)) {
    await prisma.registration.update({ where: { id: d.registrationId }, data: { status: "rejected" } });
  }

  const amountText = refunds ? (amount === null ? "the full entry fee" : `${amount} ${t.entryFeeCurrency ?? ""}`.trim()) : null;
  const forPayer = input.outcome === "for_payer";
  await notify(d.payerUserId, {
    type: "payment_dispute",
    title: `Decision on your payment dispute: ${t.name}`,
    body: refunds ? `An admin ruled for you. The organizer must refund ${amountText} within ${REFUND_DAYS} days. Confirm here when it arrives.` : forPayer ? "An admin ruled for you." : "An admin ruled for the organizer.",
    href: `/disputes/${d.id}`,
  });
  await notify(d.organizerUserId, {
    type: "payment_dispute",
    title: `Decision on a payment dispute: ${t.name}`,
    body: refunds ? `An admin ruled for the player. You must refund ${amountText} within ${REFUND_DAYS} days and mark it as sent here. Missing it pauses your paid events.` : forPayer ? "An admin ruled for the player." : "An admin ruled for you.",
    href: `/disputes/${d.id}`,
  });
  return { data: { ok: true as const } };
}

// ----------------------------------------------------------- refund tracking

export async function markRefundSent(input: { userId: string; disputeId: string }) {
  const d = await prisma.paymentDispute.findUnique({ where: { id: input.disputeId } });
  if (!d) return fail("not_found");
  if (d.organizerUserId !== input.userId) return fail("forbidden");
  if (d.outcome !== "for_payer" || !d.refundDueAt || d.refundReceivedAt) return fail("wrong_state", "There is no refund waiting to be paid on this case.");
  await prisma.paymentDispute.update({ where: { id: d.id }, data: { refundSentAt: new Date(), refundContestedAt: null } });
  await notify(d.payerUserId, { type: "payment_dispute", title: "Your refund was sent", body: "The organizer says they paid you. Please confirm once it arrives, or tell us if it hasn't.", href: `/disputes/${d.id}` });
  return { data: { ok: true as const } };
}

export async function confirmRefundReceived(input: { userId: string; disputeId: string }) {
  const d = await prisma.paymentDispute.findUnique({ where: { id: input.disputeId } });
  if (!d) return fail("not_found");
  if (d.payerUserId !== input.userId) return fail("forbidden");
  if (d.outcome !== "for_payer" || !d.refundDueAt || d.refundReceivedAt) return fail("wrong_state", "There is no refund waiting to be confirmed on this case.");
  const now = new Date();
  await prisma.paymentDispute.update({ where: { id: d.id }, data: { refundReceivedAt: now, refundSentAt: d.refundSentAt ?? now, refundContestedAt: null } });
  await notify(d.organizerUserId, { type: "payment_dispute", title: "Refund confirmed", body: "The player confirmed they received the refund. Thank you.", href: `/disputes/${d.id}` });
  return { data: { ok: true as const } };
}

/** The organizer says they paid, but the money never arrived. */
export async function contestRefund(input: { userId: string; disputeId: string }) {
  const d = await prisma.paymentDispute.findUnique({ where: { id: input.disputeId } });
  if (!d) return fail("not_found");
  if (d.payerUserId !== input.userId) return fail("forbidden");
  if (d.outcome !== "for_payer" || !d.refundSentAt || d.refundReceivedAt) return fail("wrong_state", "You can only say a refund didn't arrive after the organizer marks it as sent.");
  await prisma.paymentDispute.update({ where: { id: d.id }, data: { refundContestedAt: new Date() } });
  await notify(d.organizerUserId, { type: "payment_dispute", title: "The player says the refund didn't arrive", body: "An admin will follow up. Check that the payment went through.", href: `/disputes/${d.id}` });
  return { data: { ok: true as const } };
}

/** Admin follow-up on a refund: confirm it was settled, or give the organizer more time. */
export async function adminRefundAction(input: { adminId: string; disputeId: string; action: string; days?: unknown }) {
  const d = await prisma.paymentDispute.findUnique({ where: { id: input.disputeId } });
  if (!d) return fail("not_found");
  if (d.outcome !== "for_payer" || !d.refundDueAt || d.refundReceivedAt) return fail("wrong_state", "There is no open refund on this case.");
  const now = new Date();
  if (input.action === "mark_received") {
    await prisma.paymentDispute.update({ where: { id: d.id }, data: { refundReceivedAt: now, refundSentAt: d.refundSentAt ?? now, refundContestedAt: null } });
    await notify(d.payerUserId, { type: "payment_dispute", title: "Refund settled", body: "An admin marked your refund as settled.", href: `/disputes/${d.id}` });
  } else if (input.action === "give_more_time") {
    const days = Math.min(30, Math.max(1, Math.floor(Number(input.days) || REFUND_DAYS)));
    await prisma.paymentDispute.update({ where: { id: d.id }, data: { refundDueAt: addDays(now, days), refundSentAt: null, refundContestedAt: null } });
    await notify(d.organizerUserId, { type: "payment_dispute", title: "More time to pay a refund", body: `An admin gave you ${days} more day(s) to pay the refund.`, href: `/disputes/${d.id}` });
  } else {
    return fail("validation_error", "Unknown action.");
  }
  return { data: { ok: true as const } };
}

// ------------------------------------------------------------------- reading

export type DisputeRole = "payer" | "organizer";

const SUMMARY = {
  registration: { select: { id: true, paymentProofUrl: true, paymentReference: true, status: true } },
} as const;

export async function listMyDisputes(userId: string) {
  await sweepDisputes();
  const rows = await prisma.paymentDispute.findMany({
    where: { OR: [{ payerUserId: userId }, { organizerUserId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const names = await tournamentNames(rows.map((r) => r.tournamentId));
  return rows.map((r) => ({ ...r, tournamentName: names.get(r.tournamentId) ?? "Tournament", role: (r.payerUserId === userId ? "payer" : "organizer") as DisputeRole }));
}

async function tournamentNames(ids: string[]) {
  const ts = ids.length ? await prisma.tournament.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map<string, string>(ts.map((t: { id: string; name: string }) => [t.id, t.name]));
}

export async function getDisputeForViewer(userId: string, disputeId: string) {
  await sweepDisputes();
  const d = await prisma.paymentDispute.findUnique({ where: { id: disputeId }, include: SUMMARY });
  if (!d) return null;
  const role: DisputeRole | null = d.payerUserId === userId ? "payer" : d.organizerUserId === userId ? "organizer" : null;
  if (!role) return null;
  const t = await prisma.tournament.findUnique({ where: { id: d.tournamentId }, select: { id: true, name: true, entryFeeAmount: true, entryFeeCurrency: true } });
  const now = new Date();
  return { dispute: d, role, tournament: t, refundOverdue: isRefundOverdue(d, now) };
}

/** The registrations a payer can open a case on, with the kinds that are open to them now. */
export async function disputeFormContext(userId: string, registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      tournament: { select: { id: true, name: true, entryType: true, status: true, organizer: { select: { userId: true } } } },
      player: { select: { userId: true } },
      teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
    },
  });
  if (!reg) return null;
  const payerIds: string[] = reg.payerUserId ? [reg.payerUserId] : reg.player ? [reg.player.userId] : (reg.teamEntry?.members ?? []).map((m: { player: { userId: string } }) => m.player.userId);
  const side = payerIds.includes(userId) ? "payer" : reg.tournament.organizer.userId === userId ? "organizer" : null;
  if (!side) return null;
  const now = new Date();
  const kinds = DISPUTE_KINDS.filter((k) => k.side === side).map((k) => ({
    ...k,
    blocked: disputeBlockedReason(k.kind, { entryType: reg.tournament.entryType, hasProof: !!reg.paymentProofUrl, registrationStatus: reg.status, tournamentStatus: reg.tournament.status, registeredAt: reg.registeredAt, approvedAt: reg.approvedAt, now }),
  }));
  const open = await prisma.paymentDispute.findFirst({ where: { registrationId, status: { not: "resolved" } }, select: { id: true } });
  return { registrationId, tournamentName: reg.tournament.name, side, kinds, openDisputeId: open?.id ?? null };
}

// --------------------------------------------------------------------- admin

export async function countDisputesForAdmin() {
  const [waiting, contested] = await Promise.all([
    prisma.paymentDispute.count({ where: { status: "awaiting_admin" } }),
    prisma.paymentDispute.count({ where: { refundContestedAt: { not: null }, refundReceivedAt: null } }),
  ]);
  return waiting + contested;
}

/** Cases an admin needs to act on: undecided ones, and ordered refunds that are late or contested. */
export async function listDisputesForAdmin() {
  await sweepDisputes();
  const now = new Date();
  const rows = await prisma.paymentDispute.findMany({
    where: {
      OR: [
        { status: "awaiting_admin" },
        { outcome: "for_payer", refundDueAt: { not: null }, refundReceivedAt: null, OR: [{ refundContestedAt: { not: null } }, { refundSentAt: null, refundDueAt: { lt: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { registration: { select: { id: true, paymentProofUrl: true, paymentReference: true } } },
  });
  const ids = Array.from(new Set(rows.flatMap((r: { payerUserId: string; organizerUserId: string }) => [r.payerUserId, r.organizerUserId])));
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids as string[] } }, select: { id: true, displayName: true, email: true } }) : [];
  const names = await tournamentNames(rows.map((r: { tournamentId: string }) => r.tournamentId));
  const duplicates = await findProofMatches("registration", rows.map((r: { registrationId: string }) => r.registrationId));
  const user = (id: string) => users.find((u: { id: string }) => u.id === id);
  return rows.map((r) => ({
    ...r,
    tournamentName: names.get(r.tournamentId) ?? "Tournament",
    payer: user(r.payerUserId) ?? null,
    organizer: user(r.organizerUserId) ?? null,
    duplicate: duplicates.get(r.registrationId) ?? null,
    refundOverdue: isRefundOverdue(r, now),
  }));
}

// -------------------------------------------------------------- payout holds

/** Ordered refunds the organizer hasn't settled: each blocks new paid/prized events (see getPayoutHolds). */
export async function getRefundHolds(organizerId: string, graceDays: number) {
  const now = new Date();
  const rows = await prisma.paymentDispute.findMany({
    where: { organizerId, outcome: "for_payer", refundDueAt: { not: null }, refundReceivedAt: null },
    select: { tournamentId: true, refundDueAt: true, refundSentAt: true, refundContestedAt: true },
  });
  const cutoff = new Date(now.getTime() - graceDays * DAY_MS);
  const outstanding = rows.filter((r: { refundDueAt: Date | null; refundSentAt: Date | null; refundContestedAt: Date | null }) =>
    graceDays === 0 ? !r.refundSentAt || !!r.refundContestedAt : (!r.refundSentAt && r.refundDueAt! < cutoff) || !!r.refundContestedAt);
  const names = await tournamentNames(outstanding.map((r: { tournamentId: string }) => r.tournamentId));
  return outstanding.map((r: { tournamentId: string }) => ({ tournamentId: r.tournamentId, name: names.get(r.tournamentId) ?? "Tournament", reason: "refund_unpaid" as const }));
}
