// Platform switch for parental consent. OFF by default: nothing is gated and the
// organizer option stays hidden until you set NEXT_PUBLIC_PARENTAL_CONSENT_ENABLED=true
// (after a sending domain is verified in Resend and the waiver has been reviewed).
// NEXT_PUBLIC_ so the forms (browser) and the server both read the same value.
export function parentalConsentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PARENTAL_CONSENT_ENABLED === "true";
}

export const CONSENT_VALID_DAYS = 365; // how long an approved consent lasts
export const CONSENT_LINK_VALID_DAYS = 14; // how long the emailed link works
export const CONSENT_MAX_REQUESTS_PER_DAY = 3; // per player, to stop email spam
export const ADULT_AGE = 18;
