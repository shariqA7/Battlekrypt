// POST /api/plans/requests — { audience, planCode, proofUrl }
// Ask for a paid plan; an admin reviews the payment proof.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlanRequest } from "@/lib/services/plan-requests";
import { planError } from "@/lib/plan-helpers";
import { banGuard } from "@/lib/services/bans";

export async function POST(request: Request) {
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

  const banned = await banGuard(user.id);
  if (banned) return banned;

  const body = await request.json().catch(() => ({}));
  const result = await createPlanRequest(user.id, {
    audience: body.audience,
    planCode: body.planCode,
    proofUrl: body.proofUrl,
  });
  if ("error" in result) return planError(result);
  return NextResponse.json(result.data, { status: 201 });
}
