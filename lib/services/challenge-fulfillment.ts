// After a challenger is picked: proof of the win -> the poster pays -> the
// challenger confirms. If either side disagrees, a dispute goes to an admin.
//
//   playing --proof--> proof_review --confirm/48h--> awaiting_payout_details
//        (reward prizes skip details)  --details--> awaiting_payment
//   awaiting_payment --receipt--> payment_sent --confirm/5d--> completed
//   proof_review --dispute--> proof_disputed --admin--> (confirmed | failed)
//   payment_sent / unpaid --report--> payment_disputed --admin--> (completed | owed)
//
// The platform never touches the money: it only records who says what, with
// evidence, and lets an admin decide. Every change runs under a row lock and
// re-checks the stage, so two clicks (or a click racing a deadline) can't
// move an entry twice.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { notify } from "@/lib/services/notifications";
import { banUser } from "@/lib/services/bans";
import {
  addHours, cleanText, cleanUrls, optionalText, canReportNotPaid, challengeOutcome,
  PROOF_REVIEW_HOURS, PAYOUT_DETAILS_DAYS, PAYMENT_HOURS, PAYMENT_CONFIRM_HOURS,
  DISPUTE_RESPONSE_HOURS, OWED_PAYMENT_HOURS,
} from "@/lib/challenge-fulfillment-rules";

type Tx = Prisma.TransactionClient;
type Failure = { error: string; message: string };
type Note = { userId: string; type: string; title: string; body?: string; href: string };
type Entry = NonNullable<Awaited<ReturnType<typeof loadEntry>>>;

const fail = (error: string, message: string): Failure => ({ error, message });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Uploaded screenshots live in our storage bucket; anything else is refused.
const uploadPrefix = () => (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/` : null);

async function loadEntry(tx: Tx, id: string) {
  // Lock first, so concurrent actions on the same entry run one at a time.
  await tx.$queryRaw`SELECT id FROM "ChallengeApplication" WHERE id = ${id} FOR UPDATE`;
  return tx.challengeApplication.findUnique({ where: { id }, include: { challenge: true } });
}

async function send(notes: Note[]) {
  for (const n of notes) await notify(n.userId, { type: n.type, title: n.title, body: n.body, href: n.href });
}

const href = (e: Entry) => `/challenges/${e.challengeId}`;
const posterOf = (e: Entry) => e.challenge.posterUserId;

// ------------------------------------------------------------
// Moves every entry makes
// ------------------------------------------------------------

// When every picked entry has finished, the challenge has too.
async function refreshChallenge(tx: Tx, challengeId: string) {
  const entries = await tx.challengeApplication.findMany({
    where: { challengeId, status: "selected" },
    select: { stage: true },
  });
  const outcome = challengeOutcome(entries.map((e) => e.stage));
  if (outcome) {
    await tx.challenge.updateMany({ where: { id: challengeId, status: "in_progress" }, data: { status: outcome } });
  }
}

async function finish(tx: Tx, e: Entry, now: Date, by: "challenger" | "auto" | "admin"): Promise<Note[]> {
  await tx.challengeApplication.update({
    where: { id: e.id },
    data: {
      stage: "completed", stageDeadline: null, completedAt: now, paymentOwed: false,
      // Bank / wallet details are only needed until the prize is settled.
      payoutDetails: null,
    },
  });
  await refreshChallenge(tx, e.challengeId);
  const how = by === "auto" ? "No response was received, so it was treated as received. " : "";
  return [
    { userId: posterOf(e), type: "challenge_completed", title: `Completed: ${e.challenge.title}`, body: `${how}${e.entrantName} has been paid.`, href: href(e) },
    { userId: e.applicantUserId, type: "challenge_completed", title: `Completed: ${e.challenge.title}`, body: `${how}Prize settled.`, href: href(e) },
  ];
}

async function failEntry(tx: Tx, e: Entry, reason: string, message: string): Promise<Note[]> {
  await tx.challengeApplication.update({
    where: { id: e.id },
    data: { stage: "failed", stageDeadline: null, failedReason: reason, payoutDetails: null, paymentOwed: false },
  });
  await refreshChallenge(tx, e.challengeId);
  return [
    { userId: e.applicantUserId, type: "challenge_failed", title: `Not completed: ${e.challenge.title}`, body: message, href: href(e) },
    { userId: posterOf(e), type: "challenge_failed", title: `Not completed: ${e.challenge.title}`, body: `${e.entrantName}: ${message}`, href: href(e) },
  ];
}

// The win is accepted (by the poster, by silence, or by an admin).
async function confirmWin(tx: Tx, e: Entry, now: Date, by: "poster" | "auto" | "admin"): Promise<Note[]> {
  const who = by === "poster" ? "The poster confirmed your win." : by === "auto" ? "The poster didn't respond in time, so your win was confirmed." : "An admin confirmed your win.";
  if (e.challenge.prizeType === "reward") {
    // Nothing to pay: the poster just delivers the reward.
    await tx.challengeApplication.update({
      where: { id: e.id },
      data: { stage: "awaiting_payment", stageDeadline: addHours(now, PAYMENT_HOURS) },
    });
    return [
      { userId: e.applicantUserId, type: "challenge_win_confirmed", title: `Win confirmed: ${e.challenge.title}`, body: `${who} The poster has ${PAYMENT_HOURS} hours to deliver the reward.`, href: href(e) },
      { userId: posterOf(e), type: "challenge_pay_now", title: `Deliver the reward: ${e.challenge.title}`, body: `${e.entrantName} won. Deliver "${e.challenge.prizeDescription}" and upload proof within ${PAYMENT_HOURS} hours.`, href: href(e) },
    ];
  }
  await tx.challengeApplication.update({
    where: { id: e.id },
    data: { stage: "awaiting_payout_details", stageDeadline: new Date(now.getTime() + PAYOUT_DETAILS_DAYS * 86_400_000) },
  });
  return [
    { userId: e.applicantUserId, type: "challenge_win_confirmed", title: `Win confirmed: ${e.challenge.title}`, body: `${who} Add where the prize should be sent within ${PAYOUT_DETAILS_DAYS} days.`, href: href(e) },
    { userId: posterOf(e), type: "challenge_win_confirmed", title: `Win confirmed: ${e.challenge.title}`, body: `${e.entrantName} will share payout details next.`, href: href(e) },
  ];
}

async function openDispute(
  tx: Tx,
  e: Entry,
  d: { kind: "proof" | "payment"; openedById: string; reason: string; evidence: string[]; dueInHours: number; now: Date; missed?: boolean }
) {
  return tx.challengeDispute.create({
    data: {
      applicationId: e.id,
      challengeId: e.challengeId,
      kind: d.kind,
      openedById: d.openedById,
      reason: d.reason,
      openerEvidenceUrls: d.evidence,
      responseDueAt: addHours(d.now, d.dueInHours),
      status: d.missed ? "awaiting_admin" : "awaiting_response",
      missedDeadline: !!d.missed,
    },
  });
}

// ------------------------------------------------------------
// Challenger: proof
// ------------------------------------------------------------

export async function submitProof(
  userId: string,
  entryId: string,
  input: { matchId?: unknown; proofUrls?: unknown; note?: unknown }
): Promise<{ data: { id: string } } | Failure> {
  const matchId = cleanText(input.matchId, { min: 3, max: 80, label: "Match / game ID" });
  if ("error" in matchId) return matchId;
  const urls = cleanUrls(input.proofUrls, { min: 1, max: 4, label: "screenshot", allowedPrefix: uploadPrefix() });
  if ("error" in urls) return urls;
  const note = optionalText(input.note, 500, "Note");
  if ("error" in note) return note;

  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.applicantUserId !== userId || e.status !== "selected") return fail("not_found", "Entry not found.");
    if (e.stage !== "playing") return fail("wrong_stage", "Proof has already been sent for this entry.");
    if (e.stageDeadline && e.stageDeadline <= now) return fail("deadline_passed", "The time to complete this challenge has run out.");

    await tx.challengeApplication.update({
      where: { id: e.id },
      data: {
        stage: "proof_review", stageDeadline: addHours(now, PROOF_REVIEW_HOURS),
        matchId: matchId.data, proofUrls: urls.data, proofNote: note.data, proofSubmittedAt: now,
      },
    });
    return {
      notes: [{
        userId: posterOf(e), type: "challenge_proof", title: `Proof submitted: ${e.challenge.title}`,
        body: `${e.entrantName} says they won. Confirm or dispute within ${PROOF_REVIEW_HOURS} hours — silence counts as confirmed.`, href: href(e),
      }],
    };
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

// ------------------------------------------------------------
// Poster: confirm or dispute the proof
// ------------------------------------------------------------

export async function reviewProof(
  posterId: string,
  entryId: string,
  input: { action?: unknown; reason?: unknown; evidenceUrls?: unknown }
): Promise<{ data: { id: string } } | Failure> {
  const action = input.action === "confirm" ? "confirm" : input.action === "dispute" ? "dispute" : null;
  if (!action) return fail("validation_error", "Choose confirm or dispute.");

  let reason = "";
  let evidence: string[] = [];
  if (action === "dispute") {
    const r = cleanText(input.reason, { min: 10, max: 1000, label: "Reason" });
    if ("error" in r) return r;
    reason = r.data;
    const ev = cleanUrls(input.evidenceUrls ?? [], { min: 0, max: 4, label: "screenshot", allowedPrefix: uploadPrefix() });
    if ("error" in ev) return ev;
    evidence = ev.data;
  }

  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.challenge.posterUserId !== posterId || e.status !== "selected") return fail("not_found", "Entry not found.");
    if (e.stage !== "proof_review") return fail("wrong_stage", "There's no proof waiting for your review.");

    if (action === "confirm") return { notes: await confirmWin(tx, e, now, "poster") };

    await openDispute(tx, e, { kind: "proof", openedById: posterId, reason, evidence, dueInHours: DISPUTE_RESPONSE_HOURS, now });
    await tx.challengeApplication.update({
      where: { id: e.id },
      data: { stage: "proof_disputed", stageDeadline: addHours(now, DISPUTE_RESPONSE_HOURS) },
    });
    return {
      notes: [{
        userId: e.applicantUserId, type: "challenge_dispute", title: `Your proof was disputed: ${e.challenge.title}`,
        body: `The poster says: "${reason}". You have ${DISPUTE_RESPONSE_HOURS} hours to respond with evidence; an admin will then decide.`, href: href(e),
      }],
    };
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

// ------------------------------------------------------------
// Challenger: payout details
// ------------------------------------------------------------

export async function submitPayoutDetails(
  userId: string,
  entryId: string,
  details: unknown
): Promise<{ data: { id: string } } | Failure> {
  const d = cleanText(details, { min: 5, max: 500, label: "Payout details" });
  if ("error" in d) return d;

  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.applicantUserId !== userId || e.status !== "selected") return fail("not_found", "Entry not found.");
    if (e.challenge.prizeType === "reward") return fail("not_needed", "This prize doesn't need payout details.");

    if (e.stage === "awaiting_payout_details") {
      await tx.challengeApplication.update({
        where: { id: e.id },
        data: { payoutDetails: d.data, stage: "awaiting_payment", stageDeadline: addHours(now, PAYMENT_HOURS) },
      });
      return {
        notes: [{
          userId: posterOf(e), type: "challenge_pay_now", title: `Pay ${e.entrantName}: ${e.challenge.title}`,
          body: `Payout details are ready. Pay within ${PAYMENT_HOURS} hours and upload the receipt.`, href: href(e),
        }],
      };
    }
    // Correcting a typo before the poster has paid.
    if (e.stage === "awaiting_payment" && !e.paymentSentAt) {
      await tx.challengeApplication.update({ where: { id: e.id }, data: { payoutDetails: d.data } });
      return { notes: [{ userId: posterOf(e), type: "challenge_details_updated", title: `Payout details changed: ${e.challenge.title}`, body: "Check the new details before paying.", href: href(e) }] };
    }
    return fail("wrong_stage", "You can't change payout details at this point.");
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

// ------------------------------------------------------------
// Poster: pay / deliver
// ------------------------------------------------------------

export async function markPaid(
  posterId: string,
  entryId: string,
  input: { receiptUrls?: unknown; note?: unknown }
): Promise<{ data: { id: string } } | Failure> {
  const urls = cleanUrls(input.receiptUrls, { min: 1, max: 3, label: "receipt screenshot", allowedPrefix: uploadPrefix() });
  if ("error" in urls) return urls;
  const note = optionalText(input.note, 500, "Note");
  if ("error" in note) return note;

  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.challenge.posterUserId !== posterId || e.status !== "selected") return fail("not_found", "Entry not found.");
    if (e.stage !== "awaiting_payment") return fail("wrong_stage", "There's nothing to pay for this entry right now.");

    await tx.challengeApplication.update({
      where: { id: e.id },
      data: {
        stage: "payment_sent", stageDeadline: addHours(now, PAYMENT_CONFIRM_HOURS),
        paymentReceiptUrls: urls.data, paymentNote: note.data, paymentSentAt: now,
      },
    });
    return {
      notes: [{
        userId: e.applicantUserId, type: "challenge_paid", title: `Prize sent: ${e.challenge.title}`,
        body: `The poster says it's sent. Please confirm you received it. If you don't respond in ${PAYMENT_CONFIRM_HOURS / 24} days it will be treated as received.`, href: href(e),
      }],
    };
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

// ------------------------------------------------------------
// Challenger: confirm, or say it never arrived
// ------------------------------------------------------------

export async function confirmReceived(userId: string, entryId: string): Promise<{ data: { id: string } } | Failure> {
  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.applicantUserId !== userId || e.status !== "selected") return fail("not_found", "Entry not found.");
    if (e.stage !== "payment_sent") return fail("wrong_stage", "There's no payment to confirm yet.");
    return { notes: await finish(tx, e, now, "challenger") };
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

export async function reportNotPaid(
  userId: string,
  entryId: string,
  input: { reason?: unknown; evidenceUrls?: unknown }
): Promise<{ data: { id: string } } | Failure> {
  const reason = cleanText(input.reason, { min: 10, max: 1000, label: "Reason" });
  if ("error" in reason) return reason;
  const ev = cleanUrls(input.evidenceUrls ?? [], { min: 0, max: 4, label: "screenshot", allowedPrefix: uploadPrefix() });
  if ("error" in ev) return ev;

  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.applicantUserId !== userId || e.status !== "selected") return fail("not_found", "Entry not found.");
    if (!canReportNotPaid(e.stage, e.stageDeadline, now)) {
      return fail("wrong_stage", "You can report non-payment once the poster says it was sent, or after their payment deadline passes.");
    }

    await openDispute(tx, e, { kind: "payment", openedById: userId, reason: reason.data, evidence: ev.data, dueInHours: DISPUTE_RESPONSE_HOURS, now });
    await tx.challengeApplication.update({
      where: { id: e.id },
      data: { stage: "payment_disputed", stageDeadline: addHours(now, DISPUTE_RESPONSE_HOURS) },
    });
    return {
      notes: [{
        userId: posterOf(e), type: "challenge_dispute", title: `Payment dispute: ${e.challenge.title}`,
        body: `${e.entrantName} says the prize wasn't received. Your other challenges are frozen. You have ${DISPUTE_RESPONSE_HOURS} hours to upload proof of payment — if you can't, your account can be banned.`,
        href: href(e),
      }],
    };
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

// ------------------------------------------------------------
// The accused side answers a dispute
// ------------------------------------------------------------

export async function respondToDispute(
  userId: string,
  entryId: string,
  input: { note?: unknown; evidenceUrls?: unknown }
): Promise<{ data: { id: string } } | Failure> {
  const note = cleanText(input.note, { min: 5, max: 1000, label: "Response" });
  if ("error" in note) return note;
  const ev = cleanUrls(input.evidenceUrls ?? [], { min: 0, max: 4, label: "screenshot", allowedPrefix: uploadPrefix() });
  if ("error" in ev) return ev;

  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[] } | Failure> => {
    const e = await loadEntry(tx, entryId);
    if (!e || e.status !== "selected") return fail("not_found", "Entry not found.");
    const dispute = await tx.challengeDispute.findFirst({
      where: { applicationId: e.id, status: "awaiting_response" },
      orderBy: { createdAt: "desc" },
    });
    if (!dispute) return fail("wrong_stage", "There's no dispute waiting for your response.");

    // A proof dispute is answered by the challenger; a payment dispute by the poster.
    const responder = dispute.kind === "proof" ? e.applicantUserId : posterOf(e);
    if (userId !== responder) return fail("forbidden", "This dispute isn't waiting for you.");
    const requireEvidence = dispute.kind === "payment";
    if (requireEvidence && ev.data.length === 0) return fail("validation_error", "Upload your proof of payment.");

    await tx.challengeDispute.update({
      where: { id: dispute.id },
      data: { responderNote: note.data, responderEvidenceUrls: ev.data, respondedAt: now, status: "awaiting_admin" },
    });
    return {
      notes: [{
        userId: dispute.openedById, type: "challenge_dispute", title: `Response received: ${e.challenge.title}`,
        body: "The other side responded. An admin will review both sides and decide.", href: href(e),
      }],
    };
  });
  if ("error" in out) return out;
  await send(out.notes);
  return { data: { id: entryId } };
}

// ------------------------------------------------------------
// Admin decides a dispute
// ------------------------------------------------------------

// Cancels what a banned poster still has open, so nobody applies to a
// challenge whose poster can't pay.
async function closeOpenChallengesOf(tx: Tx, userId: string): Promise<Note[]> {
  const open = await tx.challenge.findMany({
    where: { posterUserId: userId, status: { in: ["open", "pending_review"] } },
    select: { id: true, title: true, applications: { where: { status: "applied" }, select: { applicantUserId: true } } },
  });
  const notes: Note[] = [];
  for (const c of open) {
    await tx.challenge.update({ where: { id: c.id }, data: { status: "cancelled" } });
    await tx.challengeApplication.updateMany({ where: { challengeId: c.id, status: "applied" }, data: { status: "not_selected", decidedAt: new Date() } });
    for (const a of c.applications) {
      notes.push({ userId: a.applicantUserId, type: "challenge_cancelled", title: `Challenge cancelled: ${c.title}`, href: `/challenges/${c.id}` });
    }
  }
  return notes;
}

export type BanChoice = { days: number | null } | null; // null = no ban; days null = permanent

export async function resolveDispute(
  adminId: string,
  disputeId: string,
  input: { outcome: "for_challenger" | "for_poster"; note: string; ban?: BanChoice }
): Promise<{ data: { id: string } } | Failure> {
  const note = cleanText(input.note, { min: 5, max: 1000, label: "Decision note" });
  if ("error" in note) return note;

  const now = new Date();
  const found = await prisma.challengeDispute.findUnique({ where: { id: disputeId } });
  if (!found) return fail("not_found", "Dispute not found.");

  const out = await prisma.$transaction(async (tx): Promise<{ notes: Note[]; banPoster: string | null } | Failure> => {
    const e = await loadEntry(tx, found.applicationId);
    const dispute = await tx.challengeDispute.findUnique({ where: { id: disputeId } });
    if (!e || !dispute) return fail("not_found", "Dispute not found.");
    if (dispute.status === "resolved") return fail("already_resolved", "This dispute has already been decided.");

    const notes: Note[] = [];
    let banPoster: string | null = null;

    if (dispute.kind === "proof") {
      if (e.stage !== "proof_disputed") return fail("wrong_stage", "This entry has moved on.");
      if (input.outcome === "for_challenger") notes.push(...(await confirmWin(tx, e, now, "admin")));
      else notes.push(...(await failEntry(tx, e, "proof_rejected", "An admin ruled the proof didn't show a win.")));
    } else {
      if (e.stage !== "payment_disputed") return fail("wrong_stage", "This entry has moved on.");
      if (input.outcome === "for_poster") {
        // The prize was paid: close the entry as completed.
        notes.push(...(await finish(tx, e, now, "admin")));
      } else {
        // The poster owes the prize. They get one more window to pay; their
        // account stays frozen until they do (paymentOwed).
        await tx.challengeApplication.update({
          where: { id: e.id },
          data: { stage: "awaiting_payment", stageDeadline: addHours(now, OWED_PAYMENT_HOURS), paymentOwed: true, paymentReceiptUrls: [], paymentSentAt: null },
        });
        notes.push(
          { userId: posterOf(e), type: "challenge_owed", title: `You owe a prize: ${e.challenge.title}`, body: `An admin ruled you owe ${e.entrantName}. Pay within ${OWED_PAYMENT_HOURS} hours and upload the receipt. Your account stays frozen until you do.`, href: href(e) },
          { userId: e.applicantUserId, type: "challenge_owed", title: `Ruling in your favour: ${e.challenge.title}`, body: `The poster has ${OWED_PAYMENT_HOURS} hours to pay. Confirm when you receive it.`, href: href(e) }
        );
        if (input.ban) banPoster = posterOf(e);
      }
    }

    await tx.challengeDispute.update({
      where: { id: dispute.id },
      data: { status: "resolved", outcome: input.outcome, adminNote: note.data, resolvedById: adminId, resolvedAt: now },
    });
    await tx.adminActionLog.create({
      data: { adminId, action: "resolved_challenge_dispute", targetType: "ChallengeDispute", targetId: dispute.id, notes: `${dispute.kind}: ${input.outcome} — ${note.data}` },
    });
    return { notes, banPoster };
  });
  if ("error" in out) return out;

  if (out.banPoster && input.ban) {
    const banned = await banUser(
      out.banPoster,
      `You did not pay a challenge prize that an admin ruled you owe (dispute ${disputeId}).`,
      input.ban.days,
      adminId
    );
    // Admins can't be banned; anything else that fails shouldn't undo the ruling.
    if (!("error" in banned)) {
      const closed = await prisma.$transaction((tx) => closeOpenChallengesOf(tx, out.banPoster as string));
      out.notes.push(...closed);
    }
  }
  await send(out.notes);
  return { data: { id: disputeId } };
}

// ------------------------------------------------------------
// Deadlines
// ------------------------------------------------------------

// Moves along every entry whose deadline has passed. Runs on page reads and
// from the cron route; safe to run any number of times at once.
export async function sweepFulfillment(now = new Date()) {
  const overdue = await prisma.challengeApplication.findMany({
    where: {
      status: "selected",
      stage: { in: ["playing", "proof_review", "awaiting_payout_details", "awaiting_payment", "payment_sent"] },
      stageDeadline: { lt: now },
    },
    select: { id: true, stage: true },
  });

  for (const row of overdue) {
    const notes = await prisma.$transaction(async (tx): Promise<Note[]> => {
      const e = await loadEntry(tx, row.id);
      // Re-check under the lock: someone may have acted since we looked.
      if (!e || e.stage !== row.stage || !e.stageDeadline || e.stageDeadline >= now) return [];

      switch (e.stage) {
        case "playing":
          return failEntry(tx, e, "no_proof", "No proof of the win was submitted before the deadline.");
        case "proof_review":
          return confirmWin(tx, e, now, "auto");
        case "awaiting_payout_details":
          return failEntry(tx, e, "no_payout_details", "No payout details were provided in time.");
        case "payment_sent":
          return finish(tx, e, now, "auto");
        case "awaiting_payment": {
          // Only an admin-ruled debt escalates by itself; a normal missed
          // payment is the challenger's call to report.
          if (!e.paymentOwed) return [];
          await openDispute(tx, e, {
            kind: "payment", openedById: e.applicantUserId, now, missed: true, dueInHours: 0, evidence: [],
            reason: `The poster did not pay within ${OWED_PAYMENT_HOURS} hours of the admin's ruling.`,
          });
          await tx.challengeApplication.update({ where: { id: e.id }, data: { stage: "payment_disputed", stageDeadline: null } });
          return [
            { userId: posterOf(e), type: "challenge_dispute", title: `Payment overdue: ${e.challenge.title}`, body: "You didn't pay in time after the ruling. An admin will decide next, and your account can be banned.", href: href(e) },
            { userId: e.applicantUserId, type: "challenge_dispute", title: `Escalated to an admin: ${e.challenge.title}`, body: "The poster missed the payment deadline after the ruling.", href: href(e) },
          ];
        }
        default:
          return [];
      }
    });
    await send(notes);
  }

  // Disputes whose accused side didn't answer in time go to the admin queue.
  const lapsed = await prisma.challengeDispute.findMany({
    where: { status: "awaiting_response", responseDueAt: { lt: now } },
    select: { id: true },
  });
  for (const d of lapsed) {
    const notes = await prisma.$transaction(async (tx): Promise<Note[]> => {
      const moved = await tx.challengeDispute.updateMany({
        where: { id: d.id, status: "awaiting_response", responseDueAt: { lt: now } },
        data: { status: "awaiting_admin", missedDeadline: true },
      });
      if (moved.count === 0) return [];
      const dispute = await tx.challengeDispute.findUnique({ where: { id: d.id }, include: { application: { include: { challenge: true } } } });
      if (!dispute) return [];
      const e = dispute.application;
      const accused = dispute.kind === "proof" ? e.applicantUserId : e.challenge.posterUserId;
      return [
        { userId: accused, type: "challenge_dispute", title: `No response received: ${e.challenge.title}`, body: "The response time ran out, so an admin will decide with the evidence available.", href: `/challenges/${e.challengeId}` },
        { userId: dispute.openedById, type: "challenge_dispute", title: `Sent to an admin: ${e.challenge.title}`, body: "The other side didn't respond in time.", href: `/challenges/${e.challengeId}` },
      ];
    });
    await send(notes);
  }
}

// ------------------------------------------------------------
// Poster freeze + record
// ------------------------------------------------------------

// A poster is frozen while a payment dispute against them is open, or an admin
// has ruled they owe a prize that isn't paid yet. Frozen posters can't post or
// take applications; entries already in progress carry on.
export async function isPosterFrozen(userId: string): Promise<boolean> {
  const openDispute = await prisma.challengeDispute.count({
    where: { kind: "payment", status: { in: ["awaiting_response", "awaiting_admin"] }, application: { challenge: { posterUserId: userId } } },
  });
  if (openDispute > 0) return true;
  const owed = await prisma.challengeApplication.count({
    where: { paymentOwed: true, stage: { notIn: ["completed", "failed"] }, challenge: { posterUserId: userId } },
  });
  return owed > 0;
}

// Poster IDs that are frozen, for hiding their challenges from lists.
export async function frozenPosterIds(): Promise<string[]> {
  const [disputes, owed] = await Promise.all([
    prisma.challengeDispute.findMany({
      where: { kind: "payment", status: { in: ["awaiting_response", "awaiting_admin"] } },
      select: { application: { select: { challenge: { select: { posterUserId: true } } } } },
    }),
    prisma.challengeApplication.findMany({
      where: { paymentOwed: true, stage: { notIn: ["completed", "failed"] } },
      select: { challenge: { select: { posterUserId: true } } },
    }),
  ]);
  return [...new Set([...disputes.map((d) => d.application.challenge.posterUserId), ...owed.map((o) => o.challenge.posterUserId)])];
}

// What applicants see before trusting a poster.
export async function getPosterRecord(userId: string) {
  const [completed, lost] = await Promise.all([
    prisma.challengeApplication.count({ where: { stage: "completed", challenge: { posterUserId: userId } } }),
    prisma.challengeDispute.count({
      where: { kind: "payment", outcome: "for_challenger", application: { challenge: { posterUserId: userId } } },
    }),
  ]);
  return { completed, paymentDisputesLost: lost };
}

// ------------------------------------------------------------
// Reading entries
// ------------------------------------------------------------

export interface EntryView {
  id: string;
  entrantName: string;
  kind: string;
  rating: number;
  stage: string;
  stageDeadline: string | null;
  matchId: string | null;
  proofUrls: string[];
  proofNote: string | null;
  payoutDetails: string | null;
  paymentReceiptUrls: string[];
  paymentNote: string | null;
  paymentOwed: boolean;
  failedReason: string | null;
  canReportNotPaid: boolean;
  dispute: null | {
    kind: string; status: string; reason: string; openerEvidenceUrls: string[];
    responderNote: string | null; responderEvidenceUrls: string[];
    responseDueAt: string; missedDeadline: boolean; outcome: string | null; adminNote: string | null;
    openedByViewer: boolean;
  };
}

// The poster sees every picked entry; a challenger sees only their own.
export async function getEntriesForViewer(challengeId: string, viewerId: string, isPoster: boolean): Promise<EntryView[]> {
  const rows = await prisma.challengeApplication.findMany({
    where: { challengeId, status: "selected", ...(isPoster ? {} : { applicantUserId: viewerId }) },
    orderBy: { createdAt: "asc" },
    include: { disputes: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const now = new Date();
  return rows.map((r) => {
    const d = r.disputes[0] ?? null;
    return {
      id: r.id,
      entrantName: r.entrantName,
      kind: r.kind,
      rating: r.rating,
      stage: r.stage,
      stageDeadline: r.stageDeadline?.toISOString() ?? null,
      matchId: r.matchId,
      proofUrls: r.proofUrls,
      proofNote: r.proofNote,
      payoutDetails: r.payoutDetails,
      paymentReceiptUrls: r.paymentReceiptUrls,
      paymentNote: r.paymentNote,
      paymentOwed: r.paymentOwed,
      failedReason: r.failedReason,
      canReportNotPaid: canReportNotPaid(r.stage, r.stageDeadline, now),
      dispute: d && {
        kind: d.kind, status: d.status, reason: d.reason, openerEvidenceUrls: d.openerEvidenceUrls,
        responderNote: d.responderNote, responderEvidenceUrls: d.responderEvidenceUrls,
        responseDueAt: d.responseDueAt.toISOString(), missedDeadline: d.missedDeadline,
        outcome: d.outcome, adminNote: d.adminNote, openedByViewer: d.openedById === viewerId,
      },
    };
  });
}

// ------------------------------------------------------------
// Admin queue
// ------------------------------------------------------------

export async function listDisputesForAdmin() {
  const rows = await prisma.challengeDispute.findMany({
    where: { status: { in: ["awaiting_admin", "awaiting_response"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      application: {
        include: {
          challenge: { select: { id: true, title: true, posterName: true, posterUserId: true, prizeType: true, prizeDescription: true, cashAmount: true, cashCurrency: true, payoutMethod: true } },
          applicant: { select: { email: true, displayName: true } },
        },
      },
    },
  });
  const posters = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.application.challenge.posterUserId))] } },
    select: { id: true, email: true },
  });
  const posterEmail = new Map(posters.map((p) => [p.id, p.email]));
  return rows.map((r) => ({ ...r, posterEmail: posterEmail.get(r.application.challenge.posterUserId) ?? null }));
}

export async function countDisputesAwaitingAdmin() {
  return prisma.challengeDispute.count({ where: { status: "awaiting_admin" } });
}
