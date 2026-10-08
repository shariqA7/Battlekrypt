import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { reportChallenge } from "@/lib/services/challenge-moderation";

// POST { reason: "scam" | "misleading" | "inappropriate" | "spam" | "other", details? }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await reportChallenge(auth.user.id, id, body);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "validation_error" ? 400 : result.error === "rate_limited" ? 429 : 409;
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
