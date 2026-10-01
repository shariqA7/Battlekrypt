import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkClubName } from "@/lib/services/club-names";

// GET /api/club/name-available?name=Falcon — live check for the club form.
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ available: false });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });

  const check = await checkClubName(name, user.id);
  return NextResponse.json(
    check.ok
      ? { available: true }
      : { available: false, message: check.message, canClaim: check.canClaim }
  );
}
