// Retention schedule: the cutoff dates and the two decisions that aren't just "older than".
import { RETENTION, consentAction, daysBefore, monthsBefore, retentionCutoffs, studentIdShouldGo, yearsBefore } from "../lib/retention";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const now = new Date("2026-11-10T12:00:00Z");

ok("days, months and years count back correctly", daysBefore(now, 90).toISOString().slice(0, 10) === "2026-08-12" && monthsBefore(now, 12).toISOString().slice(0, 10) === "2025-11-10" && yearsBefore(now, 6).toISOString().slice(0, 10) === "2020-11-10");
const c = retentionCutoffs(now);
ok("cutoffs follow the config", c.paymentProof.getTime() === monthsBefore(now, RETENTION.paymentProofMonthsAfterEventClosed).getTime() && c.financial.getTime() === yearsBefore(now, RETENTION.financialRecordYears).getTime() && c.readNotification.getTime() === daysBefore(now, RETENTION.readNotificationDays).getTime());
ok("financial records are kept longer than ordinary files", c.financial < c.paymentProof && c.paymentProof < c.readNotification);
ok("every period is a sensible positive number", Object.values(RETENTION).every((n) => Number.isInteger(n) && n > 0));

const old = daysBefore(now, 200);
const recent = daysBefore(now, 10);
const base = { now, liveEntries: 0, idExpiresAt: null, idUploadedAt: recent, lastUseClosedAt: null as Date | null };
ok("ID photo: never deleted while a live entry needs it", !studentIdShouldGo({ ...base, liveEntries: 1, idExpiresAt: old, idUploadedAt: old, lastUseClosedAt: old }));
ok("ID photo: deleted once the last event it was used for closed long enough ago", studentIdShouldGo({ ...base, lastUseClosedAt: old }) && !studentIdShouldGo({ ...base, lastUseClosedAt: recent }));
ok("ID photo: deleted after the card's expiry date has passed long enough", studentIdShouldGo({ ...base, idExpiresAt: old, lastUseClosedAt: recent }) && !studentIdShouldGo({ ...base, idExpiresAt: recent }));
ok("ID photo: one uploaded long ago and never used is deleted, a fresh upload is not", studentIdShouldGo({ ...base, idUploadedAt: old }) && !studentIdShouldGo(base));
ok("ID photo: a card with no expiry and no use history is left alone until the unused period passes", !studentIdShouldGo({ ...base, idExpiresAt: null, idUploadedAt: daysBefore(now, 30) }));

const consent = { now, status: "approved" as const, linkExpiresAt: old, decidedAt: old, validUntil: null as Date | null, revokedAt: null as Date | null };
ok("consent: an unanswered request is scrubbed after 90 days, not before", consentAction({ ...consent, status: "pending", decidedAt: null, linkExpiresAt: daysBefore(now, 100) }) === "scrub" && consentAction({ ...consent, status: "pending", decidedAt: null, linkExpiresAt: daysBefore(now, 30) }) === "keep");
ok("consent: an answered record is kept for 3 years after it ends", consentAction({ ...consent, validUntil: yearsBefore(now, 1) }) === "keep" && consentAction({ ...consent, validUntil: yearsBefore(now, 4) , decidedAt: yearsBefore(now, 5) }) === "scrub");
ok("consent: the LATEST end date counts (a recent revoke keeps it)", consentAction({ ...consent, validUntil: yearsBefore(now, 5), decidedAt: yearsBefore(now, 6), revokedAt: yearsBefore(now, 1) }) === "keep");
ok("consent: a record with no dates at all is kept", consentAction({ ...consent, decidedAt: null }) === "keep");

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall passed");
