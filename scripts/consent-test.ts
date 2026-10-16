// Pure checks for parental consent (no database, no network). Run: npx tsx scripts/consent-test.ts
import {
  consentNeeded, deriveConsentState, entryConsentStatus, hashConsentToken, newConsentToken,
  isPlausibleEmail, maskEmail, isValidSignedName, childDisplayName, type ConsentRecord,
} from "../lib/consent";
import { buildOutgoing, sendEmail } from "../lib/email";
import { consentRequestEmail } from "../lib/email-templates";
import { waiverParagraphs, waiverText, WAIVER_VERSION } from "../lib/consent-waiver";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-10-16");
const rec = (over: Partial<ConsentRecord>): ConsentRecord => ({
  status: "pending", validUntil: null, linkExpiresAt: d("2026-10-30"), decidedAt: null, createdAt: d("2026-10-10"), ...over,
});

// ---- who needs consent
const teen = d("2010-05-01"), adult = d("2000-01-01"), turns18Tomorrow = d("2008-10-17");
ok("off when the platform switch is off", !consentNeeded({ requireParentalConsent: true }, teen, false, now));
ok("off when the tournament doesn't ask", !consentNeeded({ requireParentalConsent: false }, teen, true, now));
ok("a 16-year-old needs it", consentNeeded({ requireParentalConsent: true }, teen, true, now));
ok("an adult doesn't", !consentNeeded({ requireParentalConsent: true }, adult, true, now));
ok("17 and 364 days still needs it", consentNeeded({ requireParentalConsent: true }, turns18Tomorrow, true, now));
ok("turns 18 today -> not needed", !consentNeeded({ requireParentalConsent: true }, d("2008-10-16"), true, now));
ok("no date of birth -> not needed (they can't register anyway)", !consentNeeded({ requireParentalConsent: true }, null, true, now));

// ---- state from records
ok("no records -> none", deriveConsentState([], now).state === "none");
ok("live pending link -> pending", deriveConsentState([rec({})], now).state === "pending");
ok("expired pending link -> none", deriveConsentState([rec({ linkExpiresAt: d("2026-10-01") })], now).state === "none");
const approved = rec({ status: "approved", decidedAt: d("2026-10-12"), validUntil: d("2027-10-12") });
ok("approved and in date -> approved", deriveConsentState([approved], now).state === "approved");
ok("approved lasts exactly until validUntil", deriveConsentState([approved], d("2027-10-12")).state === "expired" && deriveConsentState([approved], d("2027-10-11")).state === "approved");
ok("approved but out of date -> expired", deriveConsentState([approved], d("2027-11-01")).state === "expired");
ok("declined -> declined", deriveConsentState([rec({ status: "declined", decidedAt: d("2026-10-12") })], now).state === "declined");
ok("a new pending request after a decline -> pending", deriveConsentState([rec({ status: "declined", decidedAt: d("2026-10-01"), createdAt: d("2026-10-01") }), rec({})], now).state === "pending");
ok("an approval wins over a later decline attempt", deriveConsentState([approved, rec({ status: "declined", decidedAt: d("2026-10-14") })], now).state === "approved");
ok("revoked or superseded never count", deriveConsentState([rec({ status: "revoked", validUntil: d("2027-10-12") }), rec({ status: "superseded" })], now).state === "none");

// ---- organizer's column
const m = (needed: boolean, state: "approved" | "pending" | "declined" | "none" | "expired") => ({ needed, state });
ok("nobody needs it -> not_required", entryConsentStatus([m(false, "none")]) === "not_required");
ok("solo minor approved -> approved", entryConsentStatus([m(true, "approved")]) === "approved");
ok("solo minor waiting -> pending", entryConsentStatus([m(true, "none")]) === "pending");
ok("squad: adult + approved minor -> approved", entryConsentStatus([m(false, "none"), m(true, "approved")]) === "approved");
ok("squad: one minor missing -> pending", entryConsentStatus([m(true, "approved"), m(true, "pending")]) === "pending");
ok("squad: one declined -> declined", entryConsentStatus([m(true, "approved"), m(true, "declined")]) === "declined");

// ---- tokens, emails, names
const t1 = newConsentToken(), t2 = newConsentToken();
ok("tokens are long, URL-safe and unique", t1.token.length >= 43 && /^[A-Za-z0-9_-]+$/.test(t1.token) && t1.token !== t2.token);
ok("only the hash is derivable and it matches", hashConsentToken(t1.token) === t1.tokenHash && t1.tokenHash.length === 64 && !t1.tokenHash.includes(t1.token));
ok("email shape check", isPlausibleEmail("mum@example.com") && !isPlausibleEmail("mum@") && !isPlausibleEmail("a b@c.com") && !isPlausibleEmail("x@y"));
ok("email masking hides most of the name", maskEmail("parent.name@gmail.com") === "p••••••••e@gmail.com" && !maskEmail("parent.name@gmail.com").includes("arent"));
ok("signed name rules", isValidSignedName("Fatima Khan") && !isValidSignedName("  ") && !isValidSignedName("ab") && !isValidSignedName("12345"));
ok("child shown as first name + last initial", childDisplayName("Ahmed", "Khan") === "Ahmed K." && childDisplayName(null, null) === "your child");

// ---- waiver
ok("waiver says cash prizes are 18+ only", waiverText("help@x.com").includes("only for players aged 18 or over"));
ok("waiver says one year and gives the support email", waiverText("help@x.com").includes("one year") && waiverText("help@x.com").includes("help@x.com"));
ok("waiver is versioned and has several clauses", WAIVER_VERSION.length > 0 && waiverParagraphs("a@b.c").length >= 5);

// ---- email building and sending (fake network)
const msg = consentRequestEmail({ to: "mum@example.com", childName: "Ahmed K.", requestedFor: "Spring <Cup>", link: "https://bk.test/consent/abc", linkExpiresAt: d("2026-10-30") });
ok("subject names the child and the tournament", msg.subject === "Action required: approve Ahmed K.'s participation in Spring <Cup>");
ok("HTML escapes the tournament name", msg.html.includes("Spring &lt;Cup&gt;") && !msg.html.includes("<Cup>"));
ok("email has the link, the expiry date and 'one year'", msg.text.includes("https://bk.test/consent/abc") && msg.text.includes("2026-10-30") && msg.text.includes("one year"));

const live = buildOutgoing(msg, { EMAIL_FROM: "BattleKrypt <n@bk.com>", EMAIL_REPLY_TO: "me@gmail.com" });
ok("live: goes to the guardian from the configured sender", (live.payload.to as string[])[0] === "mum@example.com" && live.payload.from === "BattleKrypt <n@bk.com>" && live.payload.reply_to === "me@gmail.com" && !live.redirected);
const test = buildOutgoing(msg, { EMAIL_TEST_TO: "owner@gmail.com" });
ok("test mode: redirected to the owner, original recipient shown", (test.payload.to as string[])[0] === "owner@gmail.com" && String(test.payload.subject).startsWith("[TEST → mum@example.com]") && String(test.payload.text).includes("meant for mum@example.com") && test.redirected);
ok("default sender is Resend's test address", String(test.payload.from).includes("onboarding@resend.dev"));

async function main() {
  let called: { url: string; auth: string | null; body: string } | null = null;
  const fakeOk = (async (url: string, init: RequestInit) => { called = { url, auth: (init.headers as Record<string, string>).Authorization, body: String(init.body) }; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  const r1 = await sendEmail(msg, { RESEND_API_KEY: "re_key", EMAIL_TEST_TO: "owner@gmail.com" }, fakeOk);
  ok("sends to Resend with the key and reports success", r1.ok && called!.url === "https://api.resend.com/emails" && called!.auth === "Bearer re_key" && r1.ok && !!r1.redirected);
  ok("the real guardian address never leaves in test mode", !JSON.parse(called!.body).to.includes("mum@example.com"));

  const fake403 = (async () => new Response(JSON.stringify({ message: "You can only send testing emails to your own email address" }), { status: 403 })) as unknown as typeof fetch;
  const r2 = await sendEmail(msg, { RESEND_API_KEY: "re_key" }, fake403);
  ok("a Resend refusal is reported, with the reason", !r2.ok && r2.error === "email_failed" && String(r2.detail).includes("testing emails"));

  const fakeThrow = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  const r3 = await sendEmail(msg, { RESEND_API_KEY: "re_key" }, fakeThrow);
  ok("a network failure is reported, not thrown", !r3.ok && r3.error === "email_failed");

  const r4 = await sendEmail(msg, { NODE_ENV: "production" }, fakeOk);
  ok("production without a key refuses", !r4.ok && r4.error === "email_not_configured");
  const log = console.log; console.log = () => {};
  const r5 = await sendEmail(msg, { NODE_ENV: "development" }, fakeOk);
  console.log = log;
  ok("development without a key logs instead of failing", r5.ok && !!r5.logged);
  process.exit(fails ? 1 : 0);
}
main();
