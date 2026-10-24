// Handles the redirect back from Google/Discord/Twitch OAuth (and the older code-style
// email links). Supabase sends the user here with a `code` to exchange for a session.
// Emailed confirm/reset links now go through /auth/confirm instead (see lib/auth-confirm.ts).
import { createClient } from "@/lib/supabase/server";
import { getLoginOptions } from "@/lib/services/login-options";
import { completeSignIn } from "@/lib/post-login";
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
      return NextResponse.redirect(`${origin}${await completeSignIn(data.user, origin, redirectTo)}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
