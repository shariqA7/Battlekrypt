// What happens right after someone is signed in by ANY route (OAuth, an emailed link):
// make sure their records exist, ask a minor's guardian, turn an organization application
// into a real one, then decide where they go. One place, so the routes can't drift apart.
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { ensureUserRecord } from "@/lib/ensure-user";
import { createApplicationFromMetadata } from "@/lib/services/org-applications";
import { requestSignupConsent } from "@/lib/services/parental-consent";
import { needsOnboarding } from "@/lib/services/onboarding";

// Returns a same-site path (the caller adds the origin).
export async function completeSignIn(user: SupabaseUser, origin: string, redirectTo: string): Promise<string> {
  await ensureUserRecord(user);
  // Under-18 sign-ups: ask the guardian they named, now that their own email is confirmed.
  await requestSignupConsent(user.id, origin).catch(() => undefined);
  // Organization sign-ups carry their application in the account metadata until the email
  // is confirmed; create it now.
  const application = await createApplicationFromMetadata(user);
  if (application || user.user_metadata?.org_application) return "/organizer/application";

  // Everyone goes through onboarding once, right after their first sign-in. Not for a
  // password-reset link, which should land straight on the reset page.
  if (!redirectTo.startsWith("/reset-password") && (await needsOnboarding(user.id))) {
    return `/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`;
  }
  return redirectTo;
}
