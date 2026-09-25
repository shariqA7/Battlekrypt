// DELETE /api/club/roster/:id — remove a player from the club roster.
// (Also the first half of "move a player to another game": remove, then
// re-invite.)
import { NextResponse } from "next/server";
import { requireApprovedClub, clubError } from "@/lib/club-helpers";
import { removeFromRoster } from "@/lib/services/club-roster";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const result = await removeFromRoster(auth.club, id);
  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}
