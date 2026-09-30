import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approvePlanRequest } from "@/lib/services/plan-requests";
import { planError } from "@/lib/plan-helpers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await approvePlanRequest(id, auth.admin.id);
  if ("error" in result) return planError(result);
  return NextResponse.json(result.data);
}
