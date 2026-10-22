// Pure checks for guardian consent, withdrawal and payouts (no database).
// Run: npx tsx scripts/consent-guardian-test.ts
import { deriveConsentState, entryConsentStatus, joinNeedsConsent, type ConsentRecord } from "../lib/consent";
import { WAIVER_VERSION, waiverText } from "../lib/consent-waiver";
import { consentApprovedEmail, consentWithdrawnEmail } from "../lib/email-templates";
import { formatPayoutText, payoutStillValid, validatePayoutInput } from "../lib/payout-rules";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fails++; };

const NOW = new Date("2026-10-21T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);

// ---- who needs consent to join
ok("a 15 year old needs consent", joinNeedsConsent(new Date("2011-03-01"), true, NOW));
ok("17 years 364 days still needs it", joinNeedsConsent(new Date("2008-10-22"), true, NOW));
ok("turns 18 today: no longer needs it", !joinNeedsConsent(new Date("2008-10-21"), true, NOW));
ok("an adult never needs it", !joinNeedsConsent(new Date("1998-01-01"), true, NOW));
ok("nothing is gated while the platform switch is off", !joinNeedsConsent(new Date("2011-03-01"), false, NOW));
ok("no date of birth on file: not treated as a minor here", !joinNeedsConsent(null, true, NOW));

// ---- consent state, including withdrawal
const rec = (o: Partial<ConsentRecord> & { status: ConsentRecord["status"] }): ConsentRecord => ({
  validUntil: null, linkExpiresAt: day(14), decidedAt: null, createdAt: day(-30), revokedAt: null, ...o,
});
const approved = rec({ status: "approved", validUntil: day(300), decidedAt: day(-65), createdAt: day(-66) });
ok("approved and in date -> approved", deriveConsentState([approved], NOW).state === "approved");
const withdrawn = rec({ status: "revoked", validUntil: day(300), decidedAt: day(-65), revokedAt: day(-2), createdAt: day(-66) });
ok("withdrawn approval -> withdrawn", deriveConsentState([withdrawn], NOW).state === "withdrawn");
ok("a withdrawn approval does NOT still grant access", deriveConsentState([withdrawn], NOW).state !== "approved");
ok("withdrawn, then a new pending request -> pending", deriveConsentState([withdrawn, rec({ status: "pending", createdAt: day(-1) })], NOW).state === "pending");
const reapproved = rec({ status: "approved", validUntil: day(360), decidedAt: day(-1), createdAt: day(-2) });
ok("withdrawn, then approved again -> approved", deriveConsentState([withdrawn, reapproved], NOW).state === "approved");
ok("an expired pending link after a withdrawal -> still withdrawn", deriveConsentState([withdrawn, rec({ status: "pending", linkExpiresAt: day(-1), createdAt: day(-5) })], NOW).state === "withdrawn");
ok("a lapsed approval -> expired", deriveConsentState([rec({ status: "approved", validUntil: day(-1), decidedAt: day(-366) })], NOW).state === "expired");
ok("no records -> none", deriveConsentState([], NOW).state === "none");
ok("withdrawn shows to the organizer as declined", entryConsentStatus([{ needed: true, state: "withdrawn" }]) === "declined");

// ---- waiver v2
const w = waiverText("help@example.com");
ok("waiver version bumped", WAIVER_VERSION === "2026-10-v2");
ok("waiver says prizes go to the guardian", /paid to me/.test(w) && /not to my child/.test(w));
ok("waiver covers challenges", /challenges/.test(w));
ok("waiver explains withdrawal and its effect", /withdraw/.test(w) && /upcoming entries are cancelled/.test(w));
ok("waiver no longer says minors can't get cash prizes", !/not eligible to receive cash prizes/.test(w));
ok("waiver says what happens before approval", /cannot join any of these/.test(w));

// ---- emails
const mail = consentApprovedEmail({ to: "mum@example.com", childName: "Ahmed K.", manageLink: "https://x.test/consent/manage/abc", validUntil: day(365) });
ok("approval email carries the manage link (html + text)", mail.html.includes("/consent/manage/abc") && mail.text.includes("/consent/manage/abc"));
ok("approval email tells the guardian prizes go to them", /paid to you/.test(mail.html));
ok("approval email escapes the child's name", !consentApprovedEmail({ to: "a@b.co", childName: "<script>", manageLink: "https://x.test/a", validUntil: day(1) }).html.includes("<script>"));
ok("withdrawal email says upcoming entries were cancelled", /cancelled/.test(consentWithdrawnEmail({ to: "a@b.co", childName: "Ahmed K." }).html));

// ---- payout input
const good = { method: "JazzCash", payeeName: "Sara Khan", details: "0300-1234567" };
ok("good payout input passes", "data" in validatePayoutInput(good));
ok("unknown method rejected", "error" in validatePayoutInput({ ...good, method: "Bitcoin" }));
ok("short account details rejected", "error" in validatePayoutInput({ ...good, details: "123" }));
ok("one-word-or-less name rejected", "error" in validatePayoutInput({ ...good, payeeName: "S" }));
ok("numbers-only name rejected", "error" in validatePayoutInput({ ...good, payeeName: "12345" }));
ok("control characters are stripped", (() => { const r = validatePayoutInput({ ...good, details: "0300\u0000-1234567" }); return "data" in r && !r.data.details.includes("\u0000"); })());
ok("oversized details are cut to 400", (() => { const r = validatePayoutInput({ ...good, details: "9".repeat(900) }); return "data" in r && r.data.details.length === 400; })());

// ---- what the payer sees
const t = formatPayoutText({ payee: "guardian", payeeName: "Sara Khan", method: "JazzCash", details: "0300-1234567", childName: "Ahmed K." });
ok("a minor's payout text names the guardian and says not to pay the player", /PARENT\/GUARDIAN of Ahmed K\./.test(t) && /not the player/.test(t) && t.includes("Sara Khan") && t.includes("0300-1234567"));
ok("an adult's payout text is plain", !/GUARDIAN/.test(formatPayoutText({ payee: "self", payeeName: "Ali Raza", method: "Bank transfer", details: "PK00 XXXX" })));
ok("a minor only uses a guardian method", payoutStillValid("guardian", true) && !payoutStillValid("self", true));
ok("after turning 18 the guardian method stops being used", !payoutStillValid("guardian", false) && payoutStillValid("self", false));

console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
