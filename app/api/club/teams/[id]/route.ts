// PATCH /api/club/teams/:id — rename / set or clear coach { name?, coachName? }
// DELETE /api/club/teams/:id — delete an empty team
import { NextResponse } from "next/server";
import { requireApprovedClub, clubError } from "@/lib/club-helpers";
import { updateTeam, deleteTeam } from "@/lib/services/club-roster";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await updateTeam(auth.club, id, {
    name: body.name,
    coachName: body.coachName,
  });

  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const result = await deleteTeam(auth.club, id);
  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}
