// GET /api/admin/plan-requests — pending plan purchases awaiting review.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listPendingPlanRequests } from "@/lib/services/plan-requests";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listPendingPlanRequests());
}
