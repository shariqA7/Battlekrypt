// GET /api/players/me/registrations — "My Matches" data, exposed as a real
// endpoint. Previously only reachable via the /dashboard page's direct
// service call — a mobile client would have had no way to fetch this.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId, getMyRegistrations } from "@/lib/services/tournaments";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Sign in required." } },
      { status: 401 }
    );
  }

  const playerProfile = await getPlayerProfileByUserId(user.id);
  if (!playerProfile) {
    return NextResponse.json({ data: [] });
  }

  const registrations = await getMyRegistrations(playerProfile.id);
  return NextResponse.json({ data: registrations });
}
