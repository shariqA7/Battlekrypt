// Account rules for sign up, login and password reset. ONE module, used by the browser
// (instant feedback) and by the API routes (the real enforcement), so the two can never
// disagree. Every rule is a "check": { id, ok, message }. The API sends the full list
// back and the form shows it at the top with a tick or a cross per check.
import { COUNTRIES, isCountryCode } from "@/lib/geo-data";
import { DIAL_CODES } from "@/lib/dial-codes";
import { PLATFORM_MIN_AGE, ageOn, parseBirthDate } from "@/lib/age";

export const ADULT_AGE = 18;
export const TERMS_VERSION = "2026-10-v1"; // bump when the Terms / Privacy text changes

export interface Check {
  id: string;
  ok: boolean;
  message: string;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (what Supabase uses) ignores anything past 72 bytes

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890",
  "qwertyui", "qwerty123", "qwertyuiop", "iloveyou", "admin123", "welcome1", "welcome123",
  "letmein1", "monkey123", "dragon123", "football1", "baseball1", "abc12345", "abcd1234",
  "111111111", "00000000", "11111111", "zaq12wsx", "1q2w3e4r", "1qaz2wsx", "p@ssw0rd",
  "p@ssword", "pass1234", "changeme", "battlekrypt", "battlekrypt1", "pubgmobile", "freefire1",
]);

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "moderator", "mod", "staff", "system",
  "battlekrypt", "official", "security", "billing", "null", "undefined", "api", "www", "me",
  "organizer", "organiser", "club", "player", "players", "clubs", "tournament", "tournaments",
  "login", "logout", "signup", "register", "settings", "profile", "dashboard",
]);

// ---------------- field helpers ----------------

export const normalizeEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
export const isValidEmail = (e: string) => e.length <= 254 && EMAIL_RE.test(e);

export const normalizeUsername = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const USERNAME_RE = /^[a-z0-9_]+$/;

// ---------------- password ----------------

export interface PasswordContext {
  email?: string;
  username?: string;
}

export function passwordChecks(password: string, ctx: PasswordContext = {}): Check[] {
  const pw = typeof password === "string" ? password : "";
  const lower = pw.toLowerCase();
  const local = (ctx.email ?? "").split("@")[0];
  const user = ctx.username ?? "";
  const hitsPersonal =
    (local.length >= 4 && lower.includes(local.toLowerCase())) ||
    (user.length >= 4 && lower.includes(user.toLowerCase()));

  return [
    { id: "pw_length", ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX, message: `Password is ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` },
    { id: "pw_nospace", ok: pw.length > 0 && !/\s/.test(pw), message: "Password has no spaces" },
    { id: "pw_upper", ok: /[A-Z]/.test(pw), message: "Password has a capital letter" },
    { id: "pw_lower", ok: /[a-z]/.test(pw), message: "Password has a lowercase letter" },
    { id: "pw_number", ok: /[0-9]/.test(pw), message: "Password has a number" },
    { id: "pw_special", ok: /[^A-Za-z0-9\s]/.test(pw), message: "Password has a special character" },
    { id: "pw_common", ok: pw.length > 0 && !COMMON_PASSWORDS.has(lower) && !hitsPersonal, message: "Password is not common and does not contain your email or username" },
  ];
}

// ---------------- sign up ----------------

export interface SignupInput {
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  confirmPassword: string;
  country: string; // ISO code from the picker
  birthDate: string; // YYYY-MM-DD from the picker
  dialCountry: string; // ISO code whose dial code was chosen (optional phone)
  phone: string; // national digits, optional
  guardianEmail: string; // required when under 18
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  marketingEmail: boolean;
}

export interface SignupContext {
  usernameTaken?: boolean; // server only, from the database
  now?: Date;
}

export function coerceSignup(body: unknown): SignupInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    email: normalizeEmail(b.email),
    firstName: s(b.firstName).trim().replace(/\s+/g, " "),
    lastName: s(b.lastName).trim().replace(/\s+/g, " "),
    username: normalizeUsername(b.username),
    password: s(b.password),
    confirmPassword: s(b.confirmPassword),
    country: s(b.country).trim().toUpperCase(),
    birthDate: s(b.birthDate).trim(),
    dialCountry: s(b.dialCountry).trim().toUpperCase(),
    phone: s(b.phone).replace(/[\s()-]/g, ""),
    guardianEmail: normalizeEmail(b.guardianEmail),
    acceptTerms: b.acceptTerms === true,
    acceptPrivacy: b.acceptPrivacy === true,
    marketingEmail: b.marketingEmail === true,
  };
}

export function birthInfo(birthDate: string, now: Date = new Date()) {
  const date = parseBirthDate(birthDate, now);
  return date ? { date, age: ageOn(date, now) } : null;
}

export function signupChecks(i: SignupInput, ctx: SignupContext = {}): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message });

  add("email", isValidEmail(i.email), "Email address is valid");

  add("first_name", i.firstName.length >= 1 && i.firstName.length <= 50 && NAME_RE.test(i.firstName), "First name uses letters only (up to 50)");
  add("last_name", i.lastName.length >= 1 && i.lastName.length <= 50 && NAME_RE.test(i.lastName), "Last name uses letters only (up to 50)");

  const u = i.username;
  add("username_format", u.length >= 3 && u.length <= 20 && USERNAME_RE.test(u) && !u.startsWith("_") && !u.endsWith("_"), "Username is 3 to 20 letters, numbers or underscores");
  add("username_reserved", !RESERVED_USERNAMES.has(u), "Username is allowed");
  if (ctx.usernameTaken !== undefined) add("username_free", !ctx.usernameTaken, "Username is available");

  checks.push(...passwordChecks(i.password, { email: i.email, username: u }));
  add("pw_match", i.confirmPassword.length > 0 && i.password === i.confirmPassword, "Passwords match");

  add("country", isCountryCode(i.country), "Country is selected");

  const birth = birthInfo(i.birthDate, ctx.now);
  add("dob_valid", birth !== null, "Date of birth is a real date");
  add("dob_age", birth !== null && birth.age >= PLATFORM_MIN_AGE, `You must be ${PLATFORM_MIN_AGE} or older to join`);

  if (birth && birth.age >= PLATFORM_MIN_AGE && birth.age < ADULT_AGE) {
    add("guardian_email", isValidEmail(i.guardianEmail) && i.guardianEmail !== i.email, "Parent or guardian email is valid and different from yours");
  }

  if (i.phone) {
    const digits = i.phone.replace(/^0+/, "");
    add("phone", !!DIAL_CODES[i.dialCountry] && /^[0-9]{6,12}$/.test(digits), "Mobile number is valid");
  }

  add("terms", i.acceptTerms, "You accepted the Terms of Use");
  add("privacy", i.acceptPrivacy, "You accepted the Privacy Policy");

  return checks;
}

export const allOk = (checks: Check[]) => checks.every((c) => c.ok);
export { COUNTRIES };

// ---------------- login / reset ----------------

export function loginChecks(email: string, password: string): Check[] {
  return [
    { id: "email", ok: isValidEmail(normalizeEmail(email)), message: "Email address is valid" },
    { id: "password", ok: typeof password === "string" && password.length > 0 && password.length <= 200, message: "Password is entered" },
  ];
}

export function resetChecks(password: string, confirm: string, ctx: PasswordContext = {}): Check[] {
  return [
    ...passwordChecks(password, ctx),
    { id: "pw_match", ok: confirm.length > 0 && password === confirm, message: "Passwords match" },
  ];
}

// ---------------- organizer sign up (account part only) ----------------
// The organization details have their own rules (lib/validation/org-application.ts); this
// is the login account that goes with them, held to the same standard as a player's.
export interface OrgAccountInput {
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

export function coerceOrgAccount(body: unknown): OrgAccountInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    email: normalizeEmail(b.email),
    password: typeof b.password === "string" ? b.password : "",
    confirmPassword: typeof b.confirmPassword === "string" ? b.confirmPassword : "",
    acceptTerms: b.acceptTerms === true,
    acceptPrivacy: b.acceptPrivacy === true,
  };
}

export function orgAccountChecks(i: OrgAccountInput): Check[] {
  return [
    { id: "email", ok: isValidEmail(i.email), message: "Email address is valid" },
    ...resetChecks(i.password, i.confirmPassword, { email: i.email }),
    { id: "terms", ok: i.acceptTerms, message: "You accepted the Terms of Use" },
    { id: "privacy", ok: i.acceptPrivacy, message: "You accepted the Privacy Policy" },
  ];
}

// ---------------- username on its own (social sign-ins pick one after the fact) ----------------
export function usernameChecks(raw: string, taken?: boolean): Check[] {
  const u = normalizeUsername(raw);
  const checks: Check[] = [
    {
      id: "username_format",
      ok: u.length >= 3 && u.length <= 20 && USERNAME_RE.test(u) && !u.startsWith("_") && !u.endsWith("_"),
      message: "Username is 3 to 20 letters, numbers or underscores",
    },
    { id: "username_reserved", ok: !RESERVED_USERNAMES.has(u), message: "Username is allowed" },
  ];
  if (taken !== undefined) checks.push({ id: "username_free", ok: !taken, message: "Username is available" });
  return checks;
}
