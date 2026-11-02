// HOW LONG WE KEEP THINGS. This is the one place the retention periods live: change a number here
// and the daily job (lib/services/retention.ts) follows it. Pure (no database) so the dates and the
// rules can be tested on their own.
//
// These are starting values, NOT legal advice. The periods for financial records and consent
// records in particular should be confirmed with a lawyer or accountant for the places you operate,
// and docs/data-inventory.md (and the Privacy Policy) must say the same thing as this file.
//
// Already handled elsewhere, so not repeated here:
//   organizer ID documents      deleted on the date set when they are approved (lib/identity.ts)
//   visitor IP / browser        wiped after 90 days (lib/services/analytics.ts)
//   challenge payout details    erased when the challenge finishes
//   a deleted account           everything personal goes at once (lib/services/account-deletion.ts)

export const RETENTION = {
  /** A saved student ID photo is deleted this long after the last event that used it closed. */
  studentIdDaysAfterLastUse: 90,
  /** ...or this long after the card's printed expiry date, or after upload if it was never used. */
  studentIdDaysAfterExpiryOrUnused: 90,
  /** Payment screenshots on entries (and rejected plan payments): after the event closed, if nothing is disputed. */
  paymentProofMonthsAfterEventClosed: 12,
  /** Evidence uploaded on a resolved dispute, payment or challenge. */
  disputeEvidenceMonthsAfterResolved: 12,
  /** Challenge match screenshots and payout receipts, after the challenge entry finished. */
  challengeFileMonthsAfterFinished: 12,
  readNotificationDays: 90,
  unreadNotificationDays: 365,
  /** Duplicate-screenshot fingerprints (a hash, not the image). */
  fingerprintMonths: 24,
  /** A guardian's consent request nobody answered: their email and name are removed. */
  unansweredConsentDays: 90,
  /** Answered consent records keep who signed and from where this long after they end. */
  consentYearsAfterEnd: 3,
  /** Invoices, approved plan payments and ledger expense receipts (tax records). */
  financialRecordYears: 6,
} as const;

const DAY = 86_400_000;
export const daysBefore = (now: Date, n: number) => new Date(now.getTime() - n * DAY);
export const monthsBefore = (now: Date, n: number) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - n); return d; };
export const yearsBefore = (now: Date, n: number) => monthsBefore(now, n * 12);

/** The "older than" date for each rule, for a given moment. */
export function retentionCutoffs(now: Date) {
  return {
    studentIdLastUse: daysBefore(now, RETENTION.studentIdDaysAfterLastUse),
    studentIdExpiryOrUnused: daysBefore(now, RETENTION.studentIdDaysAfterExpiryOrUnused),
    paymentProof: monthsBefore(now, RETENTION.paymentProofMonthsAfterEventClosed),
    disputeEvidence: monthsBefore(now, RETENTION.disputeEvidenceMonthsAfterResolved),
    challengeFiles: monthsBefore(now, RETENTION.challengeFileMonthsAfterFinished),
    readNotification: daysBefore(now, RETENTION.readNotificationDays),
    unreadNotification: daysBefore(now, RETENTION.unreadNotificationDays),
    fingerprint: monthsBefore(now, RETENTION.fingerprintMonths),
    unansweredConsent: daysBefore(now, RETENTION.unansweredConsentDays),
    consentEnd: yearsBefore(now, RETENTION.consentYearsAfterEnd),
    financial: yearsBefore(now, RETENTION.financialRecordYears),
  };
}

/**
 * Should a saved student ID photo be deleted now? Never while a live entry still needs it. Otherwise
 * when the card has expired, when the last event that used it closed long enough ago, or when it
 * was uploaded and never used for that long.
 */
export function studentIdShouldGo(i: {
  now: Date;
  liveEntries: number;
  idExpiresAt: Date | null;
  idUploadedAt: Date | null;
  /** When the most recent CLOSED event that used this photo closed (null if none). */
  lastUseClosedAt: Date | null;
}): boolean {
  if (i.liveEntries > 0) return false;
  const c = retentionCutoffs(i.now);
  if (i.idExpiresAt && i.idExpiresAt < c.studentIdExpiryOrUnused) return true;
  if (i.lastUseClosedAt) return i.lastUseClosedAt < c.studentIdLastUse;
  return !!i.idUploadedAt && i.idUploadedAt < c.studentIdExpiryOrUnused;
}

/**
 * What to do with a guardian consent record: leave it, or remove the personal details it holds
 * (the guardian's email, the name they typed, their IP and browser). The record itself, that
 * consent was given and when, stays.
 */
export function consentAction(c: {
  now: Date;
  status: "pending" | "approved" | "declined" | "revoked" | "superseded";
  linkExpiresAt: Date;
  decidedAt: Date | null;
  validUntil: Date | null;
  revokedAt: Date | null;
}): "keep" | "scrub" {
  const k = retentionCutoffs(c.now);
  if (c.status === "pending") return c.linkExpiresAt < k.unansweredConsent ? "scrub" : "keep";
  const ends = [c.validUntil, c.revokedAt, c.decidedAt].filter((d): d is Date => d !== null);
  if (ends.length === 0) return "keep";
  const end = new Date(Math.max(...ends.map((d) => d.getTime())));
  return end < k.consentEnd ? "scrub" : "keep";
}
