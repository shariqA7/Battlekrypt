// GET /api/admin/organizations/user-search?q=&cursor=&limit= — accounts, 10 at a time.
// An empty q lists everyone (newest first); pass the returned nextCursor for more.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { searchUsersPage } from "@/lib/services/admin-organizations";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await searchUsersPage(parsePageQuery(request.url)));
}
