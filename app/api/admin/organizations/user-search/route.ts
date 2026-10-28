// GET /api/admin/organizations/user-search?q= — find an account by name or email
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { searchUsersForOrganizer } from "@/lib/services/admin-organizations";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json(await searchUsersForOrganizer(q));
}
