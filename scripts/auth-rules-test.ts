// Plain script (no framework): npx tsx scripts/auth-rules-test.ts
import { readSignupMetadata, buildSignupMetadata, SIGNUP_META_KEY } from "../lib/signup-profile";
import { safeRedirect } from "../lib/safe-redirect";
import { memoryRateLimit as rateLimit } from "../lib/rate-limit";
import { parseConfirmParams, isRecovery } from "../lib/auth-confirm";
import { toE164, DIAL_CODES } from "../lib/dial-codes";
import { COUNTRIES } from "../lib/geo-data";
import { coerceOrgAccount, orgAccountChecks, signupChecks, coerceSignup, passwordChecks, allOk, resetChecks, loginChecks } from "../lib/validation/auth";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
}
const failedIds = (cs: { id: string; ok: boolean }[]) => cs.filter((c) => !c.ok).map((c) => c.id);

const NOW = new Date("2026-10-21T00:00:00Z");
const good = {
  email: "Player@Example.com ", firstName: "Ayesha", lastName: "O'Neil-Khan", username: "Ayesha_77",
  password: "Str0ng!Pass", confirmPassword: "Str0ng!Pass", country: "pk", birthDate: "2000-05-04",
  dialCountry: "PK", phone: "0300 1234567", guardianEmail: "", acceptTerms: true, acceptPrivacy: true, marketingEmail: false,
};
const run = (over: object = {}, ctx = {}) => signupChecks(coerceSignup({ ...good, ...over }), { now: NOW, ...ctx });

ok("a good adult signup passes every check", allOk(run()));
ok("email is trimmed and lowercased", coerceSignup(good).email === "player@example.com");
ok("username is lowercased", coerceSignup(good).username === "ayesha_77");

// password
ok("space in password fails", failedIds(passwordChecks("Str0ng! Pass")).includes("pw_nospace"));
ok("no capital fails", failedIds(passwordChecks("str0ng!pass")).join() === "pw_upper");
ok("no number fails", failedIds(passwordChecks("Strong!Pass")).join() === "pw_number");
ok("no special char fails", failedIds(passwordChecks("Str0ngPass1")).join() === "pw_special");
ok("7 chars fails length", failedIds(passwordChecks("Str0n!a")).includes("pw_length"));
ok("73 chars fails length", failedIds(passwordChecks("Aa1!" + "x".repeat(69))).includes("pw_length"));
ok("72 chars passes length", !failedIds(passwordChecks("Aa1!" + "x".repeat(68))).includes("pw_length"));
ok("common password fails", failedIds(passwordChecks("P@ssw0rd")).includes("pw_common"));
ok("password containing email name fails", failedIds(passwordChecks("Ayesha!2024x", { email: "ayesha@x.com" })).includes("pw_common"));
ok("empty password fails space+length", failedIds(passwordChecks("")).includes("pw_nospace"));
ok("tab counts as a space", failedIds(passwordChecks("Str0ng!\tPass")).includes("pw_nospace"));

// fields
ok("mismatched confirm fails", failedIds(run({ confirmPassword: "nope" })).join() === "pw_match");
ok("bad email fails", failedIds(run({ email: "a@b" })).join() === "email");
ok("digits in name fail", failedIds(run({ firstName: "Ay3sha" })).join() === "first_name");
ok("unicode name passes", allOk(run({ firstName: "José", lastName: "Müller" })));
ok("short username fails", failedIds(run({ username: "ab" })).join() === "username_format");
ok("username with space fails", failedIds(run({ username: "my name" })).join() === "username_format");
ok("username leading underscore fails", failedIds(run({ username: "_abc" })).join() === "username_format");
ok("reserved username fails", failedIds(run({ username: "Admin" })).join() === "username_reserved");
ok("taken username fails", failedIds(run({}, { usernameTaken: true })).join() === "username_free");
ok("unknown country fails", failedIds(run({ country: "ZZ" })).join() === "country");
ok("terms required", failedIds(run({ acceptTerms: false })).join() === "terms");
ok("privacy required", failedIds(run({ acceptPrivacy: false })).join() === "privacy");
ok("marketing is optional", allOk(run({ marketingEmail: true })) && allOk(run({ marketingEmail: false })));
ok("phone optional", allOk(run({ phone: "", dialCountry: "" })));
ok("short phone fails", failedIds(run({ phone: "123" })).join() === "phone");
ok("letters in phone fail", failedIds(run({ phone: "abc12345" })).join() === "phone");

// age
ok("12 year old is rejected", failedIds(run({ birthDate: "2014-10-22" })).join() === "dob_age");
ok("exactly 13 today passes the floor", !failedIds(run({ birthDate: "2013-10-21", guardianEmail: "mum@example.com" })).includes("dob_age"));
ok("turns 13 tomorrow is rejected", failedIds(run({ birthDate: "2013-10-22" })).includes("dob_age"));
ok("future date fails", failedIds(run({ birthDate: "2030-01-01" })).includes("dob_valid"));
ok("30 Feb fails", failedIds(run({ birthDate: "2000-02-30" })).includes("dob_valid"));
ok("17 needs guardian email", failedIds(run({ birthDate: "2009-06-01" })).join() === "guardian_email");
ok("17 with guardian email passes", allOk(run({ birthDate: "2009-06-01", guardianEmail: "Mum@Example.com" })));
ok("guardian email same as own fails", failedIds(run({ birthDate: "2009-06-01", guardianEmail: "player@example.com" })).join() === "guardian_email");
ok("turns 18 today needs no guardian", allOk(run({ birthDate: "2008-10-21" })));
ok("17 years 364 days needs guardian", failedIds(run({ birthDate: "2008-10-22" })).includes("guardian_email"));
ok("adult: guardian email ignored", allOk(run({ guardianEmail: "garbage" })));

// organizer account
const org = (over: object = {}) => orgAccountChecks(coerceOrgAccount({ email: "Org@Example.com ", password: "Str0ng!Pass", confirmPassword: "Str0ng!Pass", acceptTerms: true, acceptPrivacy: true, ...over }));
ok("a good organizer account passes", allOk(org()));
ok("organizer weak password fails (8 chars was the old rule)", failedIds(org({ password: "abcdefgh", confirmPassword: "abcdefgh" })).includes("pw_upper"));
ok("organizer password with a space fails", failedIds(org({ password: "Str0ng! Pass", confirmPassword: "Str0ng! Pass" })).includes("pw_nospace"));
ok("organizer mismatch fails", failedIds(org({ confirmPassword: "x" })).join() === "pw_match");
ok("organizer must accept terms and privacy", failedIds(org({ acceptTerms: false, acceptPrivacy: false })).join() === "terms,privacy");
ok("organizer bad email fails", failedIds(org({ email: "nope" })).join() === "email");
ok("organizer password can't contain the email name", failedIds(org({ email: "falconesports@x.com", password: "Falconesports1!", confirmPassword: "Falconesports1!" })).includes("pw_common"));

// emailed confirm / reset links (token_hash, works across devices)
const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c";
const q = (o: Record<string, string>) => (k: string) => o[k] ?? null;
const SITE = "https://battlekrypt.test";
ok("a valid confirm link parses", parseConfirmParams(q({ token_hash: TOKEN, type: "email" }), SITE)?.type === "email");
ok("the older 'signup' type is accepted too", parseConfirmParams(q({ token_hash: TOKEN, type: "signup" }), SITE)?.type === "signup");
ok("a recovery link is recognised", isRecovery(parseConfirmParams(q({ token_hash: TOKEN, type: "recovery", next: "/reset-password" }), SITE)!.type));
ok("an unknown type is refused", parseConfirmParams(q({ token_hash: TOKEN, type: "admin" }), SITE) === null);
ok("a missing token is refused", parseConfirmParams(q({ type: "email" }), SITE) === null);
ok("a too-short token is refused", parseConfirmParams(q({ token_hash: "abc", type: "email" }), SITE) === null);
ok("a token with odd characters is refused", parseConfirmParams(q({ token_hash: TOKEN + "<script>", type: "email" }), SITE) === null);
ok("next must be a same-site path", parseConfirmParams(q({ token_hash: TOKEN, type: "email", next: "//evil.com" }), SITE)?.next === "/");
ok("next @evil.com is refused", parseConfirmParams(q({ token_hash: TOKEN, type: "email", next: "@evil.com" }), SITE)?.next === "/");
ok("a good next path is kept", parseConfirmParams(q({ token_hash: TOKEN, type: "email", next: "/tournaments" }), SITE)?.next === "/tournaments");
ok("the destination can come from our own redirect_to", parseConfirmParams(q({ token_hash: TOKEN, type: "email", redirect_to: SITE + "/auth/callback?redirectTo=%2Fchallenges" }), SITE)?.next === "/challenges");
ok("a redirect_to on another site is ignored", parseConfirmParams(q({ token_hash: TOKEN, type: "email", redirect_to: "https://evil.com/auth/callback?redirectTo=%2Fx" }), SITE)?.next === "/");
ok("a garbage redirect_to falls back to home", parseConfirmParams(q({ token_hash: TOKEN, type: "email", redirect_to: "not a url" }), SITE)?.next === "/");
ok("no destination at all -> home", parseConfirmParams(q({ token_hash: TOKEN, type: "email" }), SITE)?.next === "/");

// login / reset
ok("login needs email and password", failedIds(loginChecks("x", "")).join() === "email,password");
ok("reset needs match", failedIds(resetChecks("Str0ng!Pass", "other")).join() === "pw_match");

// signup metadata is untrusted: anyone can call Supabase directly with the public key
const meta = (over: object) => ({ [SIGNUP_META_KEY]: { firstName: "Ayesha", lastName: "Khan", username: "ayesha_77", country: "PK", birthDate: "2000-05-04", phone: "+923001234567", guardianEmail: "", marketingEmail: true, terms: "v1", ...over } });
const read = (over: object = {}) => readSignupMetadata(meta(over), NOW);
ok("good metadata is read", read()?.username === "ayesha_77" && read()?.country === "Pakistan" && read()?.mobileNumber === "+923001234567");
ok("round trip from the form", readSignupMetadata(buildSignupMetadata(coerceSignup(good)), NOW)?.mobileNumber === "+923001234567");
ok("no metadata -> null (social logins)", readSignupMetadata({ full_name: "x" }, NOW) === null && readSignupMetadata(null, NOW) === null);
ok("forged under-13 DOB is dropped, nothing kept", read({ birthDate: "2018-01-01" })?.birthDate === null);
ok("forged username with symbols is dropped", read({ username: "a b<script>" })?.username === null);
ok("forged country is dropped", read({ country: "ZZ" })?.country === null);
ok("forged name with digits is dropped", read({ firstName: "x1" })?.firstName === "");
ok("forged phone is dropped", read({ phone: "<b>1</b>" })?.mobileNumber === null);
ok("guardian email only kept for minors", read({ guardianEmail: "mum@example.com" })?.guardianEmail === null && read({ birthDate: "2009-06-01", guardianEmail: "mum@example.com" })?.guardianEmail === "mum@example.com");
ok("marketing needs an explicit true", read({ marketingEmail: "yes" })?.marketingEmail === false);
ok("terms flag needs a version string", read({ terms: "" })?.termsAccepted === false && read()?.termsAccepted === true);
ok("oversized strings are cut", (read({ firstName: "A".repeat(500) })?.firstName ?? "x").length === 0 || (read({ firstName: "A".repeat(500) })?.firstName.length ?? 0) <= 50);
ok("E.164 drops the leading zero", toE164("92", "0300 1234567") === "+923001234567");

// every country the sign-up picker offers needs a dial code (a new country added to
// lib/geo-data.ts without one would show "+undefined")
const noDial = Object.keys(COUNTRIES).filter((c) => !DIAL_CODES[c]);
ok(`every country has a dial code${noDial.length ? " (missing: " + noDial.join(", ") + ")" : ""}`, noDial.length === 0);
ok("no dial code for a country that no longer exists", Object.keys(DIAL_CODES).every((c) => COUNTRIES[c]));

// redirects
ok("same-site path allowed", safeRedirect("/tournaments?x=1") === "/tournaments?x=1");
ok("//evil.com blocked", safeRedirect("//evil.com") === "/");
ok("@evil.com blocked", safeRedirect("@evil.com") === "/");
ok("full URL blocked", safeRedirect("https://evil.com") === "/");
ok("backslash trick blocked", safeRedirect("/\\evil.com") === "/");
ok("newline blocked", safeRedirect("/a\nb") === "/");
ok("empty -> fallback", safeRedirect(null) === "/" && safeRedirect("", "/x") === "/x");

// rate limiter
const T = 1_000_000;
ok("allows up to the max", [0, 1, 2].every((i) => rateLimit("k1", 3, 1000, T + i).allowed));
ok("blocks the next one", !rateLimit("k1", 3, 1000, T + 3).allowed);
ok("frees up after the window", rateLimit("k1", 3, 1000, T + 5000).allowed);
ok("keys are independent", rateLimit("k2", 3, 1000, T).allowed);

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
