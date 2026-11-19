// GET /api/admin/plans — every plan (including inactive), for the admin editor.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createPlan, listPlans } from "@/lib/services/plan-requests";

export async function GET() {
  const auth = await requireAdmin("plans", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listPlans());
}

// POST /api/admin/plans — make a new plan: { audience, name, priceAmount, priceCurrency, durationDays?, limits?, depositAmount? }
// It starts from the usual paid-plan options; change them in the plan editor, or pass `limits`.
export async function POST(request: Request) {
  const auth = await requireAdmin("plans");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await createPlan(auth.admin.id, { ...b, privateForUserId: null });
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 400 });
  return NextResponse.json(r.data, { status: 201 });
}
