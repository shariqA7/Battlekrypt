import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { liftBan } from "@/lib/services/bans";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await liftBan(id, auth.admin.id);
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Ban not found or already lifted." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
