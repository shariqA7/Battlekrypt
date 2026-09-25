// PATCH /api/club/teams/:id/captain — set { playerId } or clear { playerId: null }
import { NextResponse } from "next/server";
import { requireApprovedClub, clubError } from "@/lib/club-helpers";
import { setTeamCaptain } from "@/lib/services/club-roster";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const playerId = body.playerId === null ? null : String(body.playerId ?? "");
  if (playerId === "") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "playerId is required (or null to clear)." } },
      { status: 400 }
    );
  }

  const result = await setTeamCaptain(auth.club, id, playerId);
  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}
