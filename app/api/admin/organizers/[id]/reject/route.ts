import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { rejectOrganizer } from "@/lib/services/tournaments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await rejectOrganizer(id, auth.admin.id, body.reason);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Organizer not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
