// POST /api/players/me/club-invites/:id/decline
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/player-helpers";
import { clubError } from "@/lib/club-helpers";
import { declineInvite } from "@/lib/services/club-roster";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePlayer();
  if ("response" in auth) return auth.response;

  const result = await declineInvite(auth.playerProfile.id, id);
  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}
