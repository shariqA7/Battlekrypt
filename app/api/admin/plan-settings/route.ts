// PATCH /api/admin/plan-settings — { planPaymentInstructions?, adsEnabled? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updatePlanSettings } from "@/lib/services/plan-requests";
import { planError } from "@/lib/plan-helpers";

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await updatePlanSettings({
    planPaymentInstructions: body.planPaymentInstructions,
    adsEnabled: body.adsEnabled,
  });
  if ("error" in result) return planError(result);
  return NextResponse.json(result.data);
}
