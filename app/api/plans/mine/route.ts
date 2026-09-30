// GET /api/plans/mine — the signed-in user's plan for each account type
// they have (organizer / club / player), with verified + pending state.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyPlanStates } from "@/lib/services/plan-requests";

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
  return NextResponse.json(await getMyPlanStates(user.id));
}
