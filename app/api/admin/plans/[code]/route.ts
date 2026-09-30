// PATCH /api/admin/plans/:code — edit a plan's name, price, duration,
// limits or active flag. Limits are validated strictly (lib/plans.ts).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updatePlan } from "@/lib/services/plan-requests";
import { planError } from "@/lib/plan-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await updatePlan(code, auth.admin.id, {
    name: body.name,
    priceAmount: body.priceAmount,
    priceCurrency: body.priceCurrency,
    durationDays: body.durationDays,
    limits: body.limits,
    isActive: body.isActive,
  });
  if ("error" in result) return planError(result);
  return NextResponse.json(result.data);
}
