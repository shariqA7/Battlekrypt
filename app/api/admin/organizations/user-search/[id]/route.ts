// GET /api/admin/organizations/user-search/:id — everything known about one account,
// to fill the "add organization" form and to let the admin check the person.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { getUserForOrganizer } from "@/lib/services/admin-organizations";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("organizations", "view");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const user = await getUserForOrganizer(id);
  if (!user) return NextResponse.json({ error: { code: "not_found", message: "That account doesn't exist." } }, { status: 404 });
  return NextResponse.json(user, { headers: { "Cache-Control": "no-store" } });
}
