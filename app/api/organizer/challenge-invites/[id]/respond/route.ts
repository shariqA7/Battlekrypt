// POST /api/organizer/challenge-invites/:id/respond — Body: { accept: boolean }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { respondToChallengeInvite } from "@/lib/services/challenge-institutions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.accept !== "boolean") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "accept (true/false) is required." } },
      { status: 400 }
    );
  }
  const result = await respondToChallengeInvite(id, auth.organizerProfile.id, body.accept);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 409;
    return NextResponse.json({ error: { code: result.error, message: "Couldn't answer this invite." } }, { status });
  }
  return NextResponse.json(result.data);
}
