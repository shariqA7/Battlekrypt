// POST /api/tournaments/:id/club-entries — enter a club team or solo roster
// player. Team entry: { teamId, memberPlayerIds }. Solo entry: { playerId }.
// Only the club owner (or, for a team, that team's captain) may call this.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { clubEntryError } from "@/lib/club-helpers";
import {
  submitClubTeamEntry,
  submitClubSoloEntry,
  type ClubEntryErrorCode,
} from "@/lib/services/club-entries";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const opts = {
    paymentProofUrl: typeof body.paymentProofUrl === "string" ? body.paymentProofUrl : undefined,
    customFieldResponses: body.customFieldResponses,
  };

  const result =
    typeof body.teamId === "string" && body.teamId
      ? await submitClubTeamEntry(
          auth.user.id,
          id,
          body.teamId,
          Array.isArray(body.memberPlayerIds) ? body.memberPlayerIds.map(String) : [],
          opts
        )
      : typeof body.playerId === "string" && body.playerId
        ? await submitClubSoloEntry(auth.user.id, id, body.playerId, opts)
        : null;

  if (!result) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "teamId or playerId is required." } },
      { status: 400 }
    );
  }
  if ("error" in result) {
    return clubEntryError(result as { error: ClubEntryErrorCode; message?: string });
  }
  return NextResponse.json(result.data, { status: 201 });
}
