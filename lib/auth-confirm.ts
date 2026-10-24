// The emailed "confirm your email" / "reset your password" links carry a one-time token
// (token_hash) that the SERVER verifies. Unlike the older code-exchange link, it doesn't
// depend on a secret held by the browser that signed up, so it works when the email is
// opened on a different device (sign up on a laptop, tap the link on a phone).
import { safeRedirect } from "@/lib/safe-redirect";

// What Supabase's email templates may send. "email" is the current name for a sign-up
// confirmation, "signup" the older one; both are accepted.
export const CONFIRM_TYPES = ["email", "signup", "recovery", "magiclink", "invite", "email_change"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export interface ConfirmParams {
  tokenHash: string;
  type: ConfirmType;
  next: string; // a same-site path, already made safe
}

// Reads the destination from `next` (a path), or from `redirect_to` (the full URL our own
// sign-up asked Supabase to send people back to, which carries our ?redirectTo=...).
function destination(next: string | null, redirectTo: string | null, siteOrigin?: string): string {
  if (next) return safeRedirect(next);
  if (redirectTo && siteOrigin) {
    try {
      const u = new URL(redirectTo);
      if (u.origin === siteOrigin) return safeRedirect(u.searchParams.get("redirectTo"));
    } catch {
      /* not a URL: fall through */
    }
  }
  return "/";
}

export function parseConfirmParams(get: (key: string) => string | null, siteOrigin?: string): ConfirmParams | null {
  const tokenHash = (get("token_hash") ?? "").trim();
  const type = (get("type") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{10,255}$/.test(tokenHash)) return null;
  if (!(CONFIRM_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as ConfirmType, next: destination(get("next"), get("redirect_to"), siteOrigin) };
}

export const isRecovery = (type: ConfirmType) => type === "recovery";
