// Handles the redirect back from Google/Discord/Twitch OAuth and from the confirmation
// email. Supabase sends the user here with a `code` to exchange for a session.
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { createApplicationFromMetadata } from "@/lib/services/org-applications";
import { getLoginOptions } from "@/lib/services/login-options";
import { requestSignupConsent } from "@/lib/services/parental-consent";
import { prisma } from "@/lib/prisma";
import { safeRedirect } from "@/lib/safe-redirect";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = safeRedirect(searchParams.get("redirectTo"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // The Twitch switch is enforced here too, not just by hiding the button: with it
      // off, a Twitch sign-in is refused even if someone calls the provider directly.
      if (data.user.app_metadata?.provider === "twitch" && !(await getLoginOptions()).twitch) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=twitch_off`);
      }

      await ensureUserRecord(data.user);
      // Under-18 sign-ups: ask the guardian they named, now that their own email is confirmed.
      await requestSignupConsent(data.user.id, origin).catch(() => undefined);
      // Organization sign-ups carry their application in the account
      // metadata until the email is confirmed; create it now.
      const application = await createApplicationFromMetadata(data.user);
      if (application || data.user.user_metadata?.org_application) {
        return NextResponse.redirect(`${origin}/organizer/application`);
      }

      // Password sign-ups already gave a date of birth on the form. Social logins
      // (Google/Discord/Twitch) haven't, so they finish their profile first.
      const profile = await prisma.playerProfile.findUnique({
        where: { userId: data.user.id },
        select: { birthDate: true },
      });
      if (!profile?.birthDate && !redirectTo.startsWith("/reset-password")) {
        return NextResponse.redirect(`${origin}/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`);
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
