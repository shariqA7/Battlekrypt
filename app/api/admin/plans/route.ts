// GET /api/admin/plans — every plan (including inactive), for the admin editor.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listPlans } from "@/lib/services/plan-requests";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listPlans());
}
