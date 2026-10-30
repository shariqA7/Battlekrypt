// POST /api/admin/organizations/:id/plan — give an organization a plan for a chosen period
// body: { planCode, duration: { kind: "months"|"days"|"until"|"permanent", … }, extend?, note? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { adminAssignOrganizerPlan } from "@/lib/services/admin-organizations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const result = await adminAssignOrganizerPlan({
    adminId: auth.admin.id,
    organizerId: id,
    planCode: String(b.planCode ?? ""),
    duration: b.duration,
    extend: b.extend === true,
    note: typeof b.note === "string" ? b.note : undefined,
  });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : "Organization not found." } }, { status });
  }
  return NextResponse.json(result.data);
}
