import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { dismissClaim } from "@/lib/services/club-name-claims";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await dismissClaim(id, auth.admin.id, typeof body.note === "string" ? body.note : "");
  if (result.error) {
    const messages = {
      note_required: "Add a note explaining why the claim was dismissed.",
      not_found: "Claim not found.",
      not_pending: "This claim has already been decided.",
    } as const;
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] } },
      { status: result.error === "not_found" ? 404 : result.error === "note_required" ? 400 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
