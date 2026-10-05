// POST   /api/challenges/:id/applications  — apply (as yourself, or with a club team)
// DELETE /api/challenges/:id/applications  — withdraw your application
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { ensureUserRecord } from "@/lib/ensure-user";
import { applyToChallenge, withdrawApplication } from "@/lib/services/challenge-applications";

const STATUS: Record<string, number> = {
  not_found: 404,
  plan_required: 403,
  own_challenge: 403,
  closed: 409,
  full: 409,
  already_applied: 409,
  poster_frozen: 403,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "team" ? "team" : body.kind === "player" ? "player" : null;
  if (!kind) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Choose whether you're applying as a player or with a team." } },
      { status: 400 }
    );
  }

  await ensureUserRecord(auth.user);
  const result = await applyToChallenge(auth.user.id, id, {
    kind,
    clubTeamId: typeof body.clubTeamId === "string" ? body.clubTeamId : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: STATUS[result.error] ?? 400 }
    );
  }
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const result = await withdrawApplication(auth.user.id, id);
  if ("error" in result) {
    return NextResponse.json(
      {
        error: {
          code: result.error,
          message:
            result.error === "not_found"
              ? "You haven't applied to this challenge."
              : "You've already been picked, so you can't withdraw here.",
        },
      },
      { status: result.error === "not_found" ? 404 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
