// POST /api/club/teams — create a team { gameId, name, coachName? }
import { NextResponse } from "next/server";
import { requireApprovedClub, clubError } from "@/lib/club-helpers";
import { createTeam } from "@/lib/services/club-roster";

export async function POST(request: Request) {
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await createTeam(auth.club, {
    gameId: String(body.gameId ?? ""),
    name: body.name,
    coachName: typeof body.coachName === "string" ? body.coachName : null,
  });

  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data, { status: 201 });
}
