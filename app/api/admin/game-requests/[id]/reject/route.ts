import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { rejectGameRequest } from "@/lib/services/tournaments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await rejectGameRequest(id, auth.admin.id, body.reason);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Game request not found." } },
      { status: 404 }
    );
  }
  if (result.error === "already_reviewed") {
    return NextResponse.json(
      { error: { code: "already_reviewed", message: "This request was already reviewed." } },
      { status: 409 }
    );
  }
  return NextResponse.json(result.data);
}
