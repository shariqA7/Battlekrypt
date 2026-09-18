// GET /api/admin/tournaments?flagged=true
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listFlaggedTournaments } from "@/lib/services/tournaments";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("flagged") !== "true") {
    return NextResponse.json({ data: [] });
  }

  const flags = await listFlaggedTournaments();
  return NextResponse.json({ data: flags });
}
