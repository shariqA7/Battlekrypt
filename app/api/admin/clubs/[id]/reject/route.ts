import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { rejectClub } from "@/lib/services/clubs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() || undefined : undefined;

  const result = await rejectClub(id, auth.admin.id, reason);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Club not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
