import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approveClub } from "@/lib/services/clubs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await approveClub(id, auth.admin.id);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Club not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
