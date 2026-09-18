// GET /api/admin/organizers?status=pending
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listPendingOrganizers } from "@/lib/services/tournaments";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const organizers = await listPendingOrganizers();
  return NextResponse.json({ data: organizers });
}
