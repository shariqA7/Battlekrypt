// DELETE /api/club/invites/:id — withdraw a pending invitation
import { NextResponse } from "next/server";
import { requireApprovedClub, clubError } from "@/lib/club-helpers";
import { cancelInvite } from "@/lib/services/club-roster";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const result = await cancelInvite(auth.club, id);
  if ("error" in result) return clubError(result);
  return NextResponse.json(result.data);
}
