import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { rejectChallenge } from "@/lib/services/challenges";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await rejectChallenge(id, auth.admin.id, typeof body.note === "string" ? body.note : "");
  if (result.error) {
    const messages = {
      note_required: "Tell the poster why it was rejected.",
      not_found: "Challenge not found.",
      not_pending: "This challenge isn't waiting for review.",
    } as const;
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] } },
      { status: result.error === "not_found" ? 404 : result.error === "note_required" ? 400 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
