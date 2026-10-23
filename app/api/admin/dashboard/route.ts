import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { getDashboard, parseDashRange } from "@/lib/services/admin-analytics";

// GET /api/admin/dashboard?range=today|week|month|6m|12m|all
// Lets the dashboard swap just its numbers and charts when the time range
// changes, instead of reloading the whole page.
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const range = parseDashRange(new URL(request.url).searchParams.get("range") ?? undefined);
  const data = await getDashboard(range);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
