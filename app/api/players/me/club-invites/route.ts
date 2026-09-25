// GET /api/players/me/club-invites — pending club invitations for the signed-in player
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/player-helpers";
import { listPlayerInvites } from "@/lib/services/club-roster";

export async function GET() {
  const auth = await requirePlayer();
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: await listPlayerInvites(auth.playerProfile.id) });
}
