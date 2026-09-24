import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { NextResponse } from "next/server";

// Called client-side immediately after supabase.auth.signInWithPassword()
// or a signUp() that returns a session directly (which happens if the
// Supabase project's "Confirm email" setting is off — in that case signUp
// logs the person in on the spot, with no round-trip through
// /auth/callback at all). ensureUserRecord is otherwise only ever called
// from that callback route, so without this, a password-based account
// could exist in Supabase's auth.users with no matching local User /
// PlayerProfile row — breaking every query that joins on userId.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { isNewUser } = await ensureUserRecord(user);
  return NextResponse.json({ isNewUser });
}
