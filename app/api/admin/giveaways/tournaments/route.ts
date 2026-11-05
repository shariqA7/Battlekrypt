// GET /api/admin/giveaways/tournaments?q=&cursor=&limit= — tournaments to link a giveaway to, 10 at a time.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { searchTournamentsPage } from "@/lib/services/admin-lists";

export async function GET(request: Request) {
  const auth = await requireAdmin("giveaways");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await searchTournamentsPage(parsePageQuery(request.url)));
}
