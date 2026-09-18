// GET /api/players/me — own profile
// PATCH /api/players/me — update display name / avatar
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId, updatePlayerProfile } from "@/lib/services/tournaments";

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

  const profile = await getPlayerProfileByUserId(user.id);
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
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

  const body = await request.json();
  const updated = await updatePlayerProfile(user.id, body.displayName, body.avatarUrl);
  return NextResponse.json(updated);
}
