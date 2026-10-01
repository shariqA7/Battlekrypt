import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { removeMember } from "@/lib/services/org-members";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await removeMember(auth.organizerProfile.id, id);
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Member not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
