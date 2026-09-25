// GET /api/club/invites — pending invitations this club has sent
// POST /api/club/invites — invite a player { playerId, gameId, teamId?, role? }
import { NextResponse } from "next/server";
import { requireApprovedClub, clubError } from "@/lib/club-helpers";
import { listClubInvites, sendInvite } from "@/lib/services/club-roster";

export async function GET() {
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: await listClubInvites(auth.club.id) });
}

export async function POST(request: Request) {
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await sendInvite(auth.club, {
    playerId: String(body.playerId ?? ""),
    gameId: String(body.gameId ?? ""),
    teamId: typeof body.teamId === "string" && body.teamId ? body.teamId : null,
    role: body.role,
  });

  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data, { status: 201 });
}
