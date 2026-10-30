// GET /api/admin/users/search?q=&cursor=&limit= — accounts, 10 at a time.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { listUsersPage } from "@/lib/services/admin-lists";

export async function GET(request: Request) {
  const auth = await requireAdmin("users", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listUsersPage(parsePageQuery(request.url)));
}
