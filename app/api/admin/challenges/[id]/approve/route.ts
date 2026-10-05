import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approveChallenge } from "@/lib/services/challenges";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await approveChallenge(id, auth.admin.id);
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.error === "not_found" ? "Challenge not found." : "This challenge isn't waiting for review." } },
      { status: result.error === "not_found" ? 404 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
