// GET /api/admin/game-requests?status=pending
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listPendingGameRequests } from "@/lib/services/tournaments";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const requests = await listPendingGameRequests();
  return NextResponse.json({ data: requests });
}
