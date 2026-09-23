// Handles the redirect back from Google/Discord OAuth (and email magic links).
// Supabase sends the user here with a `code` to exchange for a session.
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
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
