// GET /api/admin/clubs — clubs awaiting approval
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listPendingClubs } from "@/lib/services/clubs";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const clubs = await listPendingClubs();
  return NextResponse.json({ data: clubs });
}
