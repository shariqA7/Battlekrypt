// GET /api/admin/clubs/search?q=&cursor=&limit= — clubs, 10 at a time.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { listClubsPage } from "@/lib/services/admin-lists";

export async function GET(request: Request) {
  const auth = await requireAdmin("clubs", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listClubsPage(parsePageQuery(request.url)));
}
