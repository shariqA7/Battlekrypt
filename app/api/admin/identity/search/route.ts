// GET /api/admin/identity/search?q=...
// Find an organizer by document number (exact), or by name, organization or
// email (partial). Returns no sensitive values: revealing the kept number and
// address is a separate, logged step (POST /api/admin/identity/:id/reveal).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { searchIdentity } from "@/lib/services/identity";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchIdentity(q) }, { headers: { "Cache-Control": "no-store" } });
}
