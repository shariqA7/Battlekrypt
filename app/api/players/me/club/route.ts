// GET /api/players/me/club — the club roster spot the player currently holds (or null)
// DELETE /api/players/me/club — leave the club
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/player-helpers";
import { clubError } from "@/lib/club-helpers";
import { getPlayerMembership, leaveClub } from "@/lib/services/club-roster";

export async function GET() {
  const auth = await requirePlayer();
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: await getPlayerMembership(auth.playerProfile.id) });
}

export async function DELETE() {
  const auth = await requirePlayer();
  if ("response" in auth) return auth.response;

  const result = await leaveClub(auth.playerProfile.id);
  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}
