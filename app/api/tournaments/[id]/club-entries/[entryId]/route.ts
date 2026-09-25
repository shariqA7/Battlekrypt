// PATCH /api/tournaments/:id/club-entries/:entryId — change a team entry's
// members. Only while the tournament is still open (see roster-lock rule).
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { clubEntryError } from "@/lib/club-helpers";
import { updateClubTeamEntryMembers } from "@/lib/services/club-entries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.memberPlayerIds)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "memberPlayerIds is required." } },
      { status: 400 }
    );
  }

  const result = await updateClubTeamEntryMembers(
    auth.user.id,
    entryId,
    body.memberPlayerIds.map(String)
  );
  if ("error" in result) return clubEntryError(result);
  return NextResponse.json(result.data);
}
