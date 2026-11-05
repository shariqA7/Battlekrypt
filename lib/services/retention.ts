// The daily retention job: deletes what has been kept long enough. The periods are in
// lib/retention.ts. Files are removed BEFORE the database is cleared, so a failure just means the
// same rows are picked up again the next day. Each rule runs on its own, so one failing rule
// never stops the others.
import { prisma } from "@/lib/prisma";
import { storageDeps, type ErasureDeps } from "@/lib/services/account-deletion";
import { PROOF_BUCKET, PUBLIC_BUCKET, isPrivateProofPath, publicUrlToPath } from "@/lib/proof-storage";
import { consentAction, retentionCutoffs, studentIdShouldGo } from "@/lib/retention";

const STUDENT_ID_BUCKET = "institution-proofs";
const BATCH = 500;
const MAX_PAGES = 20;

export type RetentionDeps = Pick<ErasureDeps, "removeFiles">;
export type RetentionResult = Record<string, number | "failed">;

/** A stored value as a (bucket, path) we can delete, or null when it isn't one of our files. */
function fileOf(value: string | null | undefined): { bucket: string; path: string } | null {
  if (!value) return null;
  if (isPrivateProofPath(value)) return { bucket: PROOF_BUCKET, path: value };
  const pub = publicUrlToPath(value, process.env.NEXT_PUBLIC_SUPABASE_URL, PUBLIC_BUCKET);
  return pub ? { bucket: PUBLIC_BUCKET, path: pub } : null;
}

async function removeAll(values: (string | null | undefined)[], deps: RetentionDeps) {
  const byBucket = new Map<string, string[]>();
  for (const v of values) {
    const f = fileOf(v);
    if (f) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  }
  for (const [bucket, paths] of byBucket) await deps.removeFiles(bucket, paths);
  return values.filter((v) => fileOf(v)).length;
}

// A tournament has closed once it is completed, or cancelled (cancelling has no date of its own, so
// its last update stands in).
const closedBefore = (d: Date) => ({ OR: [{ completedAt: { lt: d } }, { status: "cancelled" as const, updatedAt: { lt: d } }] });
const unresolvedDispute = { OR: [{ status: { not: "resolved" as const } }, { outcome: "for_payer" as const, refundDueAt: { not: null }, refundReceivedAt: null }] };

export async function runRetention(now: Date = new Date(), deps: RetentionDeps = storageDeps()): Promise<RetentionResult> {
  const k = retentionCutoffs(now);
  const result: RetentionResult = {};
  const task = async (name: string, fn: () => Promise<number>) => {
    try { result[name] = await fn(); } catch (e) { console.error(`[retention] ${name} failed`, e); result[name] = "failed"; }
  };

  await task("notifications", async () =>
    (await prisma.notification.deleteMany({ where: { readAt: { lt: k.readNotification } } })).count +
    (await prisma.notification.deleteMany({ where: { readAt: null, createdAt: { lt: k.unreadNotification } } })).count);

  await task("fingerprints", async () => (await prisma.proofFingerprint.deleteMany({ where: { createdAt: { lt: k.fingerprint } } })).count);

  await task("studentIdPhotos", async () => {
    let gone = 0;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = await prisma.playerInstitution.findMany({
        where: { idImagePath: { not: null }, OR: [{ idUploadedAt: { lt: k.studentIdExpiryOrUnused } }, { idExpiresAt: { lt: k.studentIdExpiryOrUnused } }] },
        orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, idImagePath: true, idExpiresAt: true, idUploadedAt: true },
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      for (const r of rows) {
        const path = r.idImagePath!;
        const [liveEntries, entries] = await Promise.all([
          prisma.registration.count({ where: { institutionProofPath: path, status: { in: ["pending", "approved"] }, tournament: { status: { notIn: ["completed", "cancelled"] } } } }),
          prisma.registration.findMany({ where: { institutionProofPath: path, tournament: { status: { in: ["completed", "cancelled"] } } }, select: { tournament: { select: { completedAt: true, updatedAt: true } } } }),
        ]);
        const closedAts = entries.map((e: { tournament: { completedAt: Date | null; updatedAt: Date } }) => (e.tournament.completedAt ?? e.tournament.updatedAt).getTime());
        const lastUseClosedAt = closedAts.length ? new Date(Math.max(...closedAts)) : null;
        if (!studentIdShouldGo({ now, liveEntries, idExpiresAt: r.idExpiresAt, idUploadedAt: r.idUploadedAt, lastUseClosedAt })) continue;
        await deps.removeFiles(STUDENT_ID_BUCKET, [path]);
        await prisma.playerInstitution.update({ where: { id: r.id }, data: { idImagePath: null, idInstitutionId: null, idExpiresAt: null, idUploadedAt: null, studentId: null } });
        await prisma.registration.updateMany({ where: { institutionProofPath: path }, data: { institutionProofPath: null } });
        gone++;
      }
    }
    return gone;
  });

  await task("entryPaymentProofs", async () => {
    const rows = await prisma.registration.findMany({
      where: { paymentProofUrl: { not: null }, tournament: closedBefore(k.paymentProof), paymentDisputes: { none: unresolvedDispute } },
      take: BATCH, select: { id: true, paymentProofUrl: true },
    });
    await removeAll(rows.map((r: { paymentProofUrl: string | null }) => r.paymentProofUrl), deps);
    if (rows.length) await prisma.registration.updateMany({ where: { id: { in: rows.map((r: { id: string }) => r.id) } }, data: { paymentProofUrl: null } });
    return rows.length;
  });

  await task("rejectedPlanProofs", async () => {
    const rows = await prisma.planRequest.findMany({ where: { status: "rejected", reviewedAt: { lt: k.paymentProof }, NOT: { proofUrl: "erased" } }, take: BATCH, select: { id: true, proofUrl: true } });
    await removeAll(rows.map((r: { proofUrl: string }) => r.proofUrl), deps);
    if (rows.length) await prisma.planRequest.updateMany({ where: { id: { in: rows.map((r: { id: string }) => r.id) } }, data: { proofUrl: "erased" } });
    return rows.length;
  });

  await task("paymentDisputeEvidence", async () => {
    const rows = await prisma.paymentDispute.findMany({
      where: { status: "resolved", resolvedAt: { lt: k.disputeEvidence }, AND: [{ OR: [{ openerEvidenceUrls: { isEmpty: false } }, { responderEvidenceUrls: { isEmpty: false } }] }, { NOT: { outcome: "for_payer", refundDueAt: { not: null }, refundReceivedAt: null } }] },
      take: BATCH, select: { id: true, openerEvidenceUrls: true, responderEvidenceUrls: true },
    });
    for (const d of rows) {
      await removeAll([...d.openerEvidenceUrls, ...d.responderEvidenceUrls], deps);
      await prisma.paymentDispute.update({ where: { id: d.id }, data: { openerEvidenceUrls: [], responderEvidenceUrls: [] } });
    }
    return rows.length;
  });

  await task("challengeDisputeEvidence", async () => {
    const rows = await prisma.challengeDispute.findMany({
      where: { status: "resolved", resolvedAt: { lt: k.disputeEvidence }, OR: [{ openerEvidenceUrls: { isEmpty: false } }, { responderEvidenceUrls: { isEmpty: false } }] },
      take: BATCH, select: { id: true, openerEvidenceUrls: true, responderEvidenceUrls: true },
    });
    for (const d of rows) {
      await removeAll([...d.openerEvidenceUrls, ...d.responderEvidenceUrls], deps);
      await prisma.challengeDispute.update({ where: { id: d.id }, data: { openerEvidenceUrls: [], responderEvidenceUrls: [] } });
    }
    return rows.length;
  });

  await task("challengeFiles", async () => {
    const rows = await prisma.challengeApplication.findMany({
      where: { completedAt: { lt: k.challengeFiles }, stage: { in: ["completed", "failed"] }, disputes: { none: { status: { not: "resolved" } } }, OR: [{ proofUrls: { isEmpty: false } }, { paymentReceiptUrls: { isEmpty: false } }] },
      take: BATCH, select: { id: true, proofUrls: true, paymentReceiptUrls: true },
    });
    for (const a of rows) {
      await removeAll([...a.proofUrls, ...a.paymentReceiptUrls], deps);
      await prisma.challengeApplication.update({ where: { id: a.id }, data: { proofUrls: [], paymentReceiptUrls: [] } });
    }
    return rows.length;
  });

  await task("financialFiles", async () => {
    let n = 0;
    const invoices = await prisma.invoice.findMany({
      where: { proofUrl: { not: null }, OR: [{ paidAt: { lt: k.financial } }, { paidAt: null, createdAt: { lt: k.financial } }] },
      take: BATCH, select: { id: true, proofUrl: true },
    });
    await removeAll(invoices.map((i: { proofUrl: string | null }) => i.proofUrl), deps);
    if (invoices.length) await prisma.invoice.updateMany({ where: { id: { in: invoices.map((i: { id: string }) => i.id) } }, data: { proofUrl: null } });
    n += invoices.length;
    const plans = await prisma.planRequest.findMany({ where: { status: "approved", reviewedAt: { lt: k.financial }, NOT: { proofUrl: "erased" } }, take: BATCH, select: { id: true, proofUrl: true } });
    await removeAll(plans.map((p: { proofUrl: string }) => p.proofUrl), deps);
    if (plans.length) await prisma.planRequest.updateMany({ where: { id: { in: plans.map((p: { id: string }) => p.id) } }, data: { proofUrl: "erased" } });
    n += plans.length;
    const expenses = await prisma.expense.findMany({ where: { receiptUrl: { not: null }, date: { lt: k.financial } }, take: BATCH, select: { id: true, receiptUrl: true } });
    await removeAll(expenses.map((x: { receiptUrl: string | null }) => x.receiptUrl), deps);
    if (expenses.length) await prisma.expense.updateMany({ where: { id: { in: expenses.map((x: { id: string }) => x.id) } }, data: { receiptUrl: null } });
    n += expenses.length;
    const taxSlips = await prisma.taxPayment.findMany({ where: { receiptUrl: { not: null }, date: { lt: k.financial } }, take: BATCH, select: { id: true, receiptUrl: true } });
    await removeAll(taxSlips.map((x: { receiptUrl: string | null }) => x.receiptUrl), deps);
    if (taxSlips.length) await prisma.taxPayment.updateMany({ where: { id: { in: taxSlips.map((x: { id: string }) => x.id) } }, data: { receiptUrl: null } });
    n += taxSlips.length;
    // Donations are accepted money, so their screenshot is kept like an invoice's, then removed.
    const donations = await prisma.donation.findMany({ where: { createdAt: { lt: k.financial }, NOT: { proofUrl: "erased" } }, take: BATCH, select: { id: true, proofUrl: true } });
    await removeAll(donations.map((x: { proofUrl: string }) => x.proofUrl), deps);
    if (donations.length) await prisma.donation.updateMany({ where: { id: { in: donations.map((x: { id: string }) => x.id) } }, data: { proofUrl: "erased" } });
    return n + donations.length;
  });

  // A winner's name, phone and address are only needed to get the prize to them. Once it is settled
  // they go; the fact that it was delivered stays.
  await task("giveawayDeliveryDetails", async () => {
    const rows = await prisma.giveawayWinner.findMany({
      where: {
        AND: [
          { OR: [{ deliveryName: { not: null } }, { deliveryPhone: { not: null } }, { deliveryAddress: { not: null } }, { deliveryNote: { not: null } }, { disputeNote: { not: null } }] },
          {
            OR: [
              { status: "confirmed", confirmedAt: { lt: k.giveawaySettled } },
              { status: "delivered", deliveredAt: { lt: k.giveawaySentUnconfirmed } },
              { status: "replaced", giveaway: { drawnAt: { lt: k.giveawaySettled } } },
              { giveaway: { status: "cancelled", updatedAt: { lt: k.giveawaySettled } } },
            ],
          },
        ],
      },
      take: BATCH, select: { id: true },
    });
    if (rows.length) await prisma.giveawayWinner.updateMany({ where: { id: { in: rows.map((r: { id: string }) => r.id) } }, data: { deliveryName: null, deliveryPhone: null, deliveryAddress: null, deliveryNote: null, disputeNote: null } });
    return rows.length;
  });

  await task("consentRecords", async () => {
    const rows = await prisma.parentalConsent.findMany({
      // Only records that COULD be due (consentAction makes the final call), so records still in force
      // never crowd out the ones that are due.
      where: {
        NOT: { guardianEmail: "erased" },
        OR: [
          { status: "pending", linkExpiresAt: { lt: k.unansweredConsent } },
          { status: { not: "pending" }, OR: [{ decidedAt: { lt: k.consentEnd } }, { validUntil: { lt: k.consentEnd } }, { revokedAt: { lt: k.consentEnd } }] },
        ],
      },
      orderBy: { createdAt: "asc" }, take: BATCH * 4,
      select: { id: true, status: true, linkExpiresAt: true, decidedAt: true, validUntil: true, revokedAt: true },
    });
    const due = rows.filter((c: { status: "pending" | "approved" | "declined" | "revoked" | "superseded"; linkExpiresAt: Date; decidedAt: Date | null; validUntil: Date | null; revokedAt: Date | null }) => consentAction({ now, ...c }) === "scrub");
    if (due.length) {
      await prisma.parentalConsent.updateMany({
        where: { id: { in: due.map((c: { id: string }) => c.id) } },
        data: { guardianEmail: "erased", signedName: null, signedIp: null, signedUserAgent: null, manageTokenHash: null },
      });
    }
    return due.length;
  });

  return result;
}
