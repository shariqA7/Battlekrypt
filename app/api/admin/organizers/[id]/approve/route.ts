import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approveOrganizer } from "@/lib/services/tournaments";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await approveOrganizer(id, auth.admin.id);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Organizer not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
