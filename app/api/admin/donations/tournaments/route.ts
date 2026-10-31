// GET /api/admin/donations/tournaments?q=&cursor=&limit= — tournaments for the "use the fund" picker, 10 at a time.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { searchTournamentsPage } from "@/lib/services/admin-lists";

export async function GET(request: Request) {
  const auth = await requireAdmin("donations");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await searchTournamentsPage(parsePageQuery(request.url)));
}
