// Handles the redirect back from Google/Discord OAuth (and email magic links).
// Supabase sends the user here with a `code` to exchange for a session.
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { createApplicationFromMetadata } from "@/lib/services/org-applications";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { isNewUser } = await ensureUserRecord(data.user);
      // Organization sign-ups carry their application in the account
      // metadata until the email is confirmed; create it now.
      const application = await createApplicationFromMetadata(data.user);
      if (application || data.user.user_metadata?.org_application) {
        return NextResponse.redirect(`${origin}/organizer/application`);
      }
      if (isNewUser) {
        return NextResponse.redirect(
          `${origin}/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`
        );
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
