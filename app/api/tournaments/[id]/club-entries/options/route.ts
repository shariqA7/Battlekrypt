// GET /api/tournaments/:id/club-entries/options — which of the caller's club
// teams / solo roster spot are eligible to enter this tournament, and their
// current entry (if any). Used to show "Register your club team" on the
// join page. Returns { data: null } if the caller has nothing eligible.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { getClubEntryOptions } from "@/lib/services/club-entries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const data = await getClubEntryOptions(auth.user.id, id);
  return NextResponse.json({ data });
}
