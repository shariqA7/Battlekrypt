// Account deletion: request -> 14-day cooling-off -> erase. Pure rules are in
// lib/account-deletion.ts; this is the database and storage side.
//
// What "erase" means: the person's files and personal details are removed and the sign-in account
// is deleted, but the database row stays as an anonymous "Deleted user" so history still lines up
// (tournament results, ratings, payment records). Financial records (invoices, payments, approved
// plan payments, the ledger, the admin action log) are KEPT without the name, as the law may
// require, and so are bans (to stop someone dodging a ban by deleting).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { deletionBlockedEmail, deletionCompletedEmail, deletionScheduledEmail } from "@/lib/email-templates";
import { notify } from "@/lib/services/notifications";
import { getPayoutHolds } from "@/lib/services/organizer-trust";
import { ID_BUCKET } from "@/lib/identity";
import { PROOF_BUCKET, PUBLIC_BUCKET, publicUrlToPath } from "@/lib/proof-storage";
import {
  confirmPhraseOk, deletionDueAt, deletionState, makeBlocker, splitFiles, withoutOwnFiles,
  type Blocker,
} from "@/lib/account-deletion";

const STUDENT_ID_BUCKET = "institution-proofs";

export type DeletionError = "not_found" | "confirm_phrase" | "blocked" | "already_requested" | "not_requested";

// ----------------------------------------------------------------- blockers

/** What stops this account being deleted right now (an empty list means it can be). */
export async function deletionBlockers(userId: string): Promise<Blocker[]> {
  const regOf = {
    OR: [
      { player: { userId } },
      { payerUserId: userId },
      { teamEntry: { members: { some: { player: { userId } } } } },
    ],
  };
  const [user, organizer, club] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.clubProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  const party = { OR: [{ payerUserId: userId }, { organizerUserId: userId }] };
  const [openDisputes, refundsOwed, rosterCount, liveEntries, openInvoices, openPlanRequests, pendingDonations, postedChallenges, activeEntries, prizeDisputes, liveEvents, holds] = await Promise.all([
    prisma.paymentDispute.count({ where: { ...party, status: { not: "resolved" } } }),
    prisma.paymentDispute.count({ where: { ...party, outcome: "for_payer", refundDueAt: { not: null }, refundReceivedAt: null } }),
    club ? prisma.clubRoster.count({ where: { clubId: club.id } }) : Promise.resolve(0),
    prisma.registration.count({ where: { ...regOf, status: { in: ["pending", "approved"] }, tournament: { status: { in: ["registration_open", "registration_closed", "in_progress"] } } } }),
    prisma.invoice.count({ where: { userId, status: { in: ["unpaid", "proof_submitted"] } } }),
    prisma.planRequest.count({ where: { userId, status: "pending" } }),
    prisma.donation.count({ where: { userId, status: "pending" } }),
    prisma.challenge.count({ where: { posterUserId: userId, status: { in: ["pending_review", "open", "in_progress"] } } }),
    prisma.challengeApplication.count({
      where: { applicantUserId: userId, status: "selected", stage: { in: ["playing", "proof_review", "proof_disputed", "awaiting_payout_details", "awaiting_payment", "payment_sent", "payment_disputed"] } },
    }),
    prisma.prizePayout.count({ where: { status: "disputed", OR: [{ recipientUserId: userId }, { registration: regOf }] } }),
    organizer ? prisma.tournament.count({ where: { organizerId: organizer.id, status: { in: ["registration_open", "registration_closed", "in_progress"] } } }) : Promise.resolve(0),
    organizer ? getPayoutHolds(organizer.id, 0) : Promise.resolve([]),
  ]);
  return [
    user?.isAdmin ? makeBlocker("staff", 1) : null,
    makeBlocker("payment_dispute", openDisputes),
    makeBlocker("refund_owed", refundsOwed),
    makeBlocker("payout_hold", holds.length),
    makeBlocker("organizer_events", liveEvents),
    makeBlocker("club_roster", rosterCount),
    makeBlocker("live_entries", liveEntries),
    makeBlocker("open_invoices", openInvoices + openPlanRequests + pendingDonations),
    makeBlocker("challenge_posted", postedChallenges),
    makeBlocker("challenge_entry", activeEntries),
    makeBlocker("prize_dispute", prizeDisputes),
  ].filter((b): b is Blocker => b !== null);
}

// --------------------------------------------------------- request / cancel

export async function getDeletionOverview(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { deletionRequestedAt: true, deletionDueAt: true, deletedAt: true } });
  if (!u) return null;
  return { state: deletionState(u, new Date()), blockers: await deletionBlockers(userId) };
}

export async function requestDeletion(input: { userId: string; confirm: unknown; origin: string }): Promise<{ error: DeletionError; blockers?: Blocker[] } | { ok: true; dueAt: Date }> {
  if (!confirmPhraseOk(input.confirm)) return { error: "confirm_phrase" };
  const u = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, deletionRequestedAt: true, deletedAt: true } });
  if (!u || u.deletedAt) return { error: "not_found" };
  if (u.deletionRequestedAt) return { error: "already_requested" };
  const blockers = await deletionBlockers(input.userId);
  if (blockers.length > 0) return { error: "blocked", blockers };

  const now = new Date();
  const dueAt = deletionDueAt(now);
  await prisma.user.update({ where: { id: input.userId }, data: { deletionRequestedAt: now, deletionDueAt: dueAt } });
  if (u.email) {
    const sent = await sendEmail(deletionScheduledEmail({ to: u.email, dueAt, accountLink: `${input.origin}/account` }));
    if (!sent.ok) console.error("[account-deletion] could not email the scheduled notice", sent);
  }
  await notify(input.userId, { type: "account", title: "Account deletion scheduled", body: `Your account will be deleted on ${dueAt.toISOString().slice(0, 10)}. You can cancel any time before then.`, href: "/account" });
  return { ok: true, dueAt };
}

export async function cancelDeletion(userId: string): Promise<{ error: DeletionError } | { ok: true }> {
  const moved = await prisma.user.updateMany({ where: { id: userId, deletionRequestedAt: { not: null }, deletedAt: null }, data: { deletionRequestedAt: null, deletionDueAt: null } });
  return moved.count === 0 ? { error: "not_requested" } : { ok: true };
}

// ------------------------------------------------------------------- erasing

/** The storage and sign-in operations erasure needs, so tests can pass fakes. */
export type ErasureDeps = {
  /** Every file in `<folder>/` of a bucket, as full paths. */
  listFolder(bucket: string, folder: string): Promise<string[]>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  /** Delete the sign-in account. Already being gone is not an error. */
  deleteAuthUser(userId: string): Promise<void>;
};

export function storageDeps(): ErasureDeps {
  const sb = () => createServiceClient();
  return {
    async listFolder(bucket, folder) {
      const out: string[] = [];
      const { data, error } = await sb().storage.from(bucket).list(folder, { limit: 1000 });
      if (error) throw new Error(`Couldn't list ${bucket}/${folder}: ${error.message}`);
      for (const f of data ?? []) if (f.id) out.push(`${folder}/${f.name}`);
      // one more level (files are at <user id>/<kind>/<file>)
      for (const f of data ?? []) {
        if (f.id) continue;
        const sub = await sb().storage.from(bucket).list(`${folder}/${f.name}`, { limit: 1000 });
        for (const g of sub.data ?? []) if (g.id) out.push(`${folder}/${f.name}/${g.name}`);
      }
      return out;
    },
    async removeFiles(bucket, paths) {
      if (paths.length === 0) return;
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await sb().storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error(`Couldn't delete files from ${bucket}: ${error.message}`);
      }
    },
    async deleteAuthUser(userId) {
      const { error } = await sb().auth.admin.deleteUser(userId);
      if (error && !/not.?found/i.test(error.message)) throw new Error(`Couldn't delete the sign-in account: ${error.message}`);
    },
  };
}

/**
 * Erase one account. Order matters so a failure can simply be retried: files first, then the
 * sign-in account, then the database scrub (which is what marks the account as erased).
 */
export async function eraseUser(userId: string, deps: ErasureDeps = storageDeps()): Promise<{ erased: boolean; filesRemoved: number; filesKept: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, avatarUrl: true, deletedAt: true, deletionRequestedAt: true, isAdmin: true },
  });
  if (!user || user.deletedAt || user.isAdmin) return { erased: false, filesRemoved: 0, filesKept: 0 };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const [player, organizer, club] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.clubProfile.findUnique({ where: { userId }, select: { id: true, logoUrl: true } }),
  ]);

  // ---- 1. files. Payment files that back a kept financial record stay.
  const keep = new Set<string>();
  for (const i of await prisma.invoice.findMany({ where: { userId, proofUrl: { not: null } }, select: { proofUrl: true } })) if (i.proofUrl) keep.add(i.proofUrl);
  for (const p of await prisma.planRequest.findMany({ where: { userId, status: "approved" }, select: { proofUrl: true } })) keep.add(p.proofUrl);
  const proofFiles = splitFiles(await deps.listFolder(PROOF_BUCKET, userId), keep);
  await deps.removeFiles(PROOF_BUCKET, proofFiles.remove);
  const idFiles = await deps.listFolder(ID_BUCKET, userId);
  await deps.removeFiles(ID_BUCKET, idFiles);
  const studentFiles = await deps.listFolder(STUDENT_ID_BUCKET, userId);
  await deps.removeFiles(STUDENT_ID_BUCKET, studentFiles);
  const publicFiles = [user.avatarUrl, club?.logoUrl].flatMap((u) => { const p = u ? publicUrlToPath(u, supabaseUrl, PUBLIC_BUCKET) : null; return p ? [p] : []; });
  await deps.removeFiles(PUBLIC_BUCKET, publicFiles);
  const filesRemoved = proofFiles.remove.length + idFiles.length + studentFiles.length + publicFiles.length;

  // ---- 2. the sign-in account
  await deps.deleteAuthUser(userId);

  // ---- 3. the database scrub, all or nothing
  const now = new Date();
  const ownedFolder = `${userId}/`;
  const involvedDisputes = await prisma.paymentDispute.findMany({
    where: { OR: [{ payerUserId: userId }, { organizerUserId: userId }] },
    select: { id: true, openerEvidenceUrls: true, responderEvidenceUrls: true },
  });
  const challengeDisputes = await prisma.challengeDispute.findMany({
    where: { OR: [{ openedById: userId }, { application: { applicantUserId: userId } }, { application: { challenge: { posterUserId: userId } } }] },
    select: { id: true, openerEvidenceUrls: true, responderEvidenceUrls: true },
  });
  const applications = await prisma.challengeApplication.findMany({
    where: { OR: [{ applicantUserId: userId }, { challenge: { posterUserId: userId } }] },
    select: { id: true, proofUrls: true, paymentReceiptUrls: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { email: null, phone: null, displayName: "Deleted user", avatarUrl: null, kycStatus: "none", deletedAt: now, deletionRequestedAt: null, deletionDueAt: null },
    });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.visitSession.updateMany({ where: { userId }, data: { userId: null, ip: null, city: null, userAgent: null } });
    await tx.proofFingerprint.updateMany({ where: { userId }, data: { userId: null } });

    if (player) {
      await tx.playerProfile.update({
        where: { id: player.id },
        data: {
          firstName: "Deleted", lastName: "player", mobileNumber: null, region: null, country: null, city: null, age: null,
          birthDate: null, gender: null, hobbies: null, favoriteGames: [], username: null, guardianEmail: null,
          marketingEmail: false, marketingEmailAt: null,
        },
      });
      await tx.playerPayoutMethod.deleteMany({ where: { playerId: player.id } });
      await tx.playerInstitution.deleteMany({ where: { playerId: player.id } });
      await tx.clubRoster.deleteMany({ where: { playerId: player.id } });
      await tx.clubInvite.deleteMany({ where: { playerId: player.id } });
      // Consent: keep that it was given and when, drop who signed and from where.
      await tx.parentalConsent.updateMany({
        where: { playerId: player.id },
        data: { guardianEmail: "erased", signedName: null, signedIp: null, signedUserAgent: null, manageTokenHash: null },
      });
      await tx.registration.updateMany({
        where: { OR: [{ playerId: player.id }, { payerUserId: userId }] },
        data: { customFieldResponses: Prisma.DbNull, institutionProofPath: null },
      });
    }

    if (organizer) {
      await tx.organizerProfile.update({
        where: { id: organizer.id },
        data: { orgName: "Deleted organization", bio: null, socialLinks: Prisma.DbNull, registrationNumber: null, website: null, address: null, city: null, contactEmail: null, contactPhone: null },
      });
      await tx.organizationMember.deleteMany({ where: { organizerId: organizer.id } });
      await tx.identityVerification.deleteMany({ where: { organizerId: organizer.id } });
    }
    await tx.organizationMember.deleteMany({ where: { userId } });
    await tx.organizationApplication.updateMany({
      where: { userId },
      data: { orgName: "Deleted organization", description: "", registrationNumber: null, website: null, address: "", contactEmail: "", contactPhone: "", handlerName: "", handlerRole: "", handlerPhone: "" },
    });

    if (club) {
      await tx.clubProfile.update({ where: { id: club.id }, data: { clubName: `Deleted club ${club.id.slice(0, 8)}`, logoUrl: null, feeProofUrl: null, feeReference: null, nameKey: null } });
    }

    // Donations are financial records and stay (the name is already gone), but what the donor wrote goes.
    await tx.donation.updateMany({ where: { userId }, data: { message: null } });
    // Ratings an organizer received keep their stars; the written comment of a deleted person goes.
    await tx.organizerRating.updateMany({ where: { raterUserId: userId }, data: { comment: null } });

    await tx.challenge.updateMany({ where: { posterUserId: userId }, data: { posterName: "Deleted user" } });
    await tx.challengeApplication.updateMany({ where: { applicantUserId: userId }, data: { entrantName: "Deleted player", payoutDetails: null } });
    for (const a of applications) {
      await tx.challengeApplication.update({ where: { id: a.id }, data: { proofUrls: withoutOwnFiles(a.proofUrls, userId), paymentReceiptUrls: withoutOwnFiles(a.paymentReceiptUrls, userId) } });
    }
    for (const d of involvedDisputes) {
      await tx.paymentDispute.update({ where: { id: d.id }, data: { openerEvidenceUrls: withoutOwnFiles(d.openerEvidenceUrls, userId), responderEvidenceUrls: withoutOwnFiles(d.responderEvidenceUrls, userId) } });
    }
    for (const d of challengeDisputes) {
      await tx.challengeDispute.update({ where: { id: d.id }, data: { openerEvidenceUrls: withoutOwnFiles(d.openerEvidenceUrls, userId), responderEvidenceUrls: withoutOwnFiles(d.responderEvidenceUrls, userId) } });
    }
    // Files that were removed above no longer exist: clear the links (kept financial proofs stay).
    const gone = (v: string | null) => !!v && v.startsWith(ownedFolder) && !keep.has(v);
    for (const r of await tx.registration.findMany({ where: { OR: [{ player: { userId } }, { payerUserId: userId }] }, select: { id: true, paymentProofUrl: true } })) {
      if (gone(r.paymentProofUrl)) await tx.registration.update({ where: { id: r.id }, data: { paymentProofUrl: null } });
    }
    for (const p of await tx.planRequest.findMany({ where: { userId, status: { not: "approved" } }, select: { id: true, proofUrl: true } })) {
      if (gone(p.proofUrl)) await tx.planRequest.update({ where: { id: p.id }, data: { proofUrl: "erased" } });
    }
    for (const x of await tx.expense.findMany({ where: { createdById: userId, receiptUrl: { not: null } }, select: { id: true, receiptUrl: true } })) {
      if (gone(x.receiptUrl)) await tx.expense.update({ where: { id: x.id }, data: { receiptUrl: null } });
    }

    await tx.accountErasure.create({ data: { userId, requestedAt: user.deletionRequestedAt, filesRemoved, filesKept: proofFiles.kept.length, note: "scheduled deletion" } });
  });

  if (user.email) {
    const sent = await sendEmail(deletionCompletedEmail({ to: user.email }));
    if (!sent.ok) console.error("[account-deletion] could not email the completed notice", sent);
  }
  return { erased: true, filesRemoved, filesKept: proofFiles.kept.length };
}

/** The daily job: erase every account whose cooling-off has ended, unless something is open again. */
export async function processDueDeletions(now: Date = new Date(), deps: ErasureDeps = storageDeps(), origin = process.env.NEXT_PUBLIC_SITE_URL ?? "") {
  const due = await prisma.user.findMany({ where: { deletionDueAt: { lte: now }, deletedAt: null }, select: { id: true, email: true } });
  const result = { erased: 0, cancelled: 0, failed: 0 };
  for (const u of due) {
    try {
      const blockers = await deletionBlockers(u.id);
      if (blockers.length > 0) {
        await prisma.user.update({ where: { id: u.id }, data: { deletionRequestedAt: null, deletionDueAt: null } });
        await notify(u.id, { type: "account", title: "Account deletion cancelled", body: "Something is still open on your account. Sort it out, then request deletion again.", href: "/account" });
        if (u.email) await sendEmail(deletionBlockedEmail({ to: u.email, reasons: blockers.map((b) => b.message), accountLink: `${origin}/account` }));
        result.cancelled++;
        continue;
      }
      const r = await eraseUser(u.id, deps);
      if (r.erased) result.erased++;
    } catch (e) {
      console.error("[account-deletion] failed for", u.id, e);
      result.failed++;
    }
  }
  return result;
}
