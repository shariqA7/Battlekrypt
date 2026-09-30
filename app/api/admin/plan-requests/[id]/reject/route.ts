import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { rejectPlanRequest } from "@/lib/services/plan-requests";
import { planError } from "@/lib/plan-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await rejectPlanRequest(id, auth.admin.id, body.note);
  if ("error" in result) return planError(result);
  return NextResponse.json(result.data);
}
