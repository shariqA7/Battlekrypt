// POST /api/admin/organizations/:id/plan-change — { planCode } start an upgrade (creates the invoice) or
// schedule a downgrade for the end of the current period, on an organization's behalf.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { requestPlanChange } from "@/lib/services/plan-changes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await requestPlanChange({ organizerId: id, targetCode: String(b.planCode ?? ""), adminId: auth.admin.id });
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: r.error === "not_found" ? 404 : 409 });
  return NextResponse.json(r.data);
}
