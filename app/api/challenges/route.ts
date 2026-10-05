// POST /api/challenges — post a challenge as a player, club or organization.
// Plan limits (posts per month, prize cap) are enforced here, server-side.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { ensureUserRecord } from "@/lib/ensure-user";
import { validateChallenge } from "@/lib/validation/challenge";
import { createChallenge } from "@/lib/services/challenges";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const parsed = validateChallenge(await request.json().catch(() => null));
  if ("errors" in parsed) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Please fix the highlighted fields.", fields: parsed.errors } },
      { status: 400 }
    );
  }

  await ensureUserRecord(auth.user);
  const result = await createChallenge(auth.user.id, parsed.data);

  if ("error" in result) {
    const status =
      result.error === "fx_unavailable" ? 503
      : result.error === "validation_error" || result.error === "game_not_found" ? 400
      : 403;
    return NextResponse.json(
      { error: { code: result.error, message: result.message, ...("fields" in result && { fields: result.fields }) } },
      { status }
    );
  }
  return NextResponse.json(result.data, { status: 201 });
}
