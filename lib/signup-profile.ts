// The sign-up form's answers travel in the account's metadata until the email is
// confirmed (there is no session before that, so nothing can be written to our own
// tables yet). When the account is first used we turn them into a PlayerProfile.
//
// The metadata is NOT trusted: anyone can call Supabase directly with the public key and
// put anything in it. So readSignupMetadata() re-checks every field with the same rules
// as the sign-up route and drops whatever doesn't pass.
import { COUNTRIES, isCountryCode } from "@/lib/geo-data";
import { DIAL_CODES, toE164 } from "@/lib/dial-codes";
import { PLATFORM_MIN_AGE } from "@/lib/age";
import {
  ADULT_AGE, TERMS_VERSION, birthInfo, isValidEmail, normalizeEmail, normalizeUsername,
  type SignupInput,
} from "@/lib/validation/auth";

export const SIGNUP_META_KEY = "signup_profile";

export interface SignupProfileData {
  firstName: string;
  lastName: string;
  username: string | null;
  country: string | null; // country NAME, matching what the profile form stores
  birthDate: Date | null;
  mobileNumber: string | null;
  guardianEmail: string | null;
  marketingEmail: boolean;
  termsAccepted: boolean;
}

export function buildSignupMetadata(i: SignupInput) {
  return {
    full_name: `${i.firstName} ${i.lastName}`.trim(),
    [SIGNUP_META_KEY]: {
      firstName: i.firstName,
      lastName: i.lastName,
      username: i.username,
      country: i.country,
      birthDate: i.birthDate,
      phone: i.phone ? toE164(DIAL_CODES[i.dialCountry] ?? "", i.phone) : "",
      guardianEmail: i.guardianEmail,
      marketingEmail: i.marketingEmail,
      terms: i.acceptTerms && i.acceptPrivacy ? TERMS_VERSION : "",
    },
  };
}

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;

export function readSignupMetadata(meta: unknown, now: Date = new Date()): SignupProfileData | null {
  const raw = (meta as Record<string, unknown> | null | undefined)?.[SIGNUP_META_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

  const first = str(r.firstName, 50).trim();
  const last = str(r.lastName, 50).trim();
  const username = normalizeUsername(str(r.username, 40));
  const countryCode = str(r.country, 2).toUpperCase();
  const birth = birthInfo(str(r.birthDate, 10), now);
  const phone = str(r.phone, 20);
  const guardian = normalizeEmail(str(r.guardianEmail, 254));

  const underage = birth ? birth.age < PLATFORM_MIN_AGE : false;
  const minor = birth ? birth.age >= PLATFORM_MIN_AGE && birth.age < ADULT_AGE : false;

  return {
    firstName: NAME_RE.test(first) ? first : "",
    lastName: NAME_RE.test(last) ? last : "",
    username: /^[a-z0-9_]{3,20}$/.test(username) && !username.startsWith("_") && !username.endsWith("_") ? username : null,
    country: isCountryCode(countryCode) ? COUNTRIES[countryCode].name : null,
    // Under 13: keep nothing, the same rule the profile form applies.
    birthDate: birth && !underage ? birth.date : null,
    mobileNumber: /^\+[0-9]{7,15}$/.test(phone) ? phone : null,
    guardianEmail: minor && isValidEmail(guardian) ? guardian : null,
    marketingEmail: r.marketingEmail === true,
    termsAccepted: typeof r.terms === "string" && r.terms.length > 0,
  };
}
